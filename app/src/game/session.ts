// Client game session: the single source of truth for the first screen.
// Pure functions over immutable state. All XP math and fog reveal goes through the shared engines in ../../../src,
// exactly as the server will run them, so the optimistic client view matches the ledger.
import { greatCircleDistance, latLngToCell } from "h3-js";
import {
  computeAward, playerLevels, skillForm, skillLevels, streakMult,
  type AwardInput, type AwardResult, type DifficultyMode, type SkillCode,
} from "../../../src/xp/xp-engine";
import {
  DISTRICT_MILESTONES, FOG_RES, districtOf, districtProgress, revealCells, validateFixes, type Fix,
} from "../../../src/spatial/spatial-engine";
import type { Quest } from "../../../src/quests/quest-generator";
import { type ClassCode, type OnboardingAnswers } from "../../../src/onboarding/calibration";
import type { Goal } from "./setup";
import { xpBonus } from "./skilltree";
import { msg, type Msg } from "../i18n";

export const SKILLS: readonly SkillCode[] = ["vitality", "craft", "wealth", "charisma", "mindset"];

export interface Waypoint { id: string; kind: string; name: string; lat: number; lng: number; radiusM: number }

export interface SkillState { xp: number; idleDays: number; earnedToday: number }

/** Who the player told us they are at character creation. Absent until onboarding is finished. */
export interface Profile {
  calibrationVersion: number;
  className: ClassCode;
  classNode: string;
  calibratedMode: DifficultyMode;
  rulesMode: DifficultyMode;         // streak and decay rules; `difficulty` below is the XP mode
  lifeLoad: number;
  constraints: string[];             // pillar 3 PlayerContext.constraints
  targetEffort: number;
  answers: OnboardingAnswers;        // device only, so recalibration can re-open them; the server gets derived values
  createdAt: number;
  goals?: Goal[];                    // 1-3 main quests the player picked
  setupDone?: boolean;               // goals and places screens seen; characters made before they existed get them once
}

export interface Player {
  name: string;
  difficulty: DifficultyMode;        // XP multiplier mode (pillar 4 xpMode)
  totalXp: number;
  rested: number;
  streakDays: number;
  skills: Record<SkillCode, SkillState>;
  profile?: Profile;
  nodes?: string[];                  // skill tree nodes bought, in order; the class root is implied by profile.classNode
  title?: string;                    // worn title from the trees, shown instead of the class name
  respectSeen?: number;              // id of the last Respect whose rested XP was credited (game/social.ts)
}

export interface QuestEntry { quest: Quest; status: "open" | "done"; awardedXp?: number }

export interface Session {
  player: Player;
  quests: QuestEntry[];
  waypoints: Waypoint[];
  districtNames: Record<string, string>;
  explored: ReadonlySet<string>;     // res-10 fog cells, all time
  newCells: ReadonlySet<string>;     // revealed since the session started, for exploration quests
  position: Fix;
}

// ---------- XP ----------

function awardInput(s: Session, q: Quest): AwardInput {
  const skills = {} as AwardInput["skills"];
  for (const code of SKILLS) {
    const st = s.player.skills[code];
    skills[code] = { level: skillLevels.levelFor(st.xp), idleDays: st.idleDays, earnedToday: st.earnedToday };
  }
  return {
    tier: q.tier,
    effort: q.effort,
    skillWeights: Object.fromEntries(q.skill_weights.map(w => [w.skill, w.weight])),
    difficulty: s.player.difficulty,
    verification: q.verification,
    streakDays: s.player.streakDays,
    repeatIndex: 1,                  // a generated batch never repeats a template inside 24h
    rested: s.player.rested,
    skills,
  };
}

/** What completing this quest would pay right now. Shown on the card; the server re-prices on submit. */
export function previewAward(s: Session, q: Quest): AwardResult {
  const r = computeAward(awardInput(s, q));
  // Skill tree nodes: {"xp_mult": {<skill>: x}} on that skill's share only (pillar 1 skill_nodes.effects).
  // The class root node (+5% in the class skill, pillar 4 §2 B) is one of them.
  const bonus = xpBonus(s.player);
  const perSkill = { ...r.perSkill };
  let extra = 0;
  for (const [skill, pct] of Object.entries(bonus) as [SkillCode, number][]) {
    const base = perSkill[skill];
    if (!base || !pct) continue;
    const add = Math.floor(base * pct);
    perSkill[skill] = base + add;
    extra += add;
  }
  if (!extra) return r;
  return { ...r, totalXp: r.totalXp + extra, perSkill, multipliers: { ...r.multipliers, skillTree: 1 + extra / (r.totalXp || 1) } };
}

const PINNED_NAMES: Record<string, string> = { home: "Home", work: "Work", gym: "Gym" };
/** A home/work/gym the player pinned (setup.ts names them by kind), as opposed to a named map waypoint. */
export const isPinnedPlace = (w: Waypoint) => PINNED_NAMES[w.kind] === w.name;

export type Gate = { ok: true } | { ok: false; reason: Msg };

/** Whether the player can turn this quest in now: prerequisites, being at the waypoint, fog revealed. */
export function questGate(s: Session, q: Quest): Gate {
  const blocker = q.prerequisites
    .map(id => s.quests.find(e => e.quest.local_id === id))
    .find(e => e && e.status !== "done");
  if (blocker) return { ok: false, reason: msg("gate.finishFirst", { quest: blocker.quest.title }) };

  if (q.success.type === "geofence_dwell" && q.location.type === "waypoint") {
    const wp = s.waypoints.find(w => w.id === q.location.ref);
    if (!wp) return { ok: false, reason: msg("gate.unknownPlace") };
    const d = greatCircleDistance([s.position.lat, s.position.lng], [wp.lat, wp.lng], "m");
    if (d > wp.radiusM) {
      // A place the player pinned is named by its kind, in their language; other waypoints keep their own name.
      const place = isPinnedPlace(wp) ? msg(`place.${wp.kind}` as "place.home") : wp.name;
      return { ok: false, reason: msg("gate.goTo", { place, distance: formatDistance(d) }) };
    }
  }

  if (q.kind === "exploration" && q.success.type === "count" && q.success.target) {
    const ref = q.location.type === "district" ? q.location.ref : null;
    const n = [...s.newCells].filter(c => !ref || districtOf(c) === ref).length;
    if (n < q.success.target) return { ok: false, reason: msg("gate.reveal", { n: q.success.target - n }) };
  }
  return { ok: true };
}

export type CompleteResult =
  | { ok: true; session: Session; award: AwardResult; levelUp: { from: number; to: number } | null }
  | { ok: false; reason: Msg };

export function completeQuest(s: Session, localId: string): CompleteResult {
  const entry = s.quests.find(e => e.quest.local_id === localId);
  if (!entry) return { ok: false, reason: msg("gate.noQuest") };
  if (entry.status === "done") return { ok: false, reason: msg("gate.alreadyDone") };
  const gate = questGate(s, entry.quest);
  if (!gate.ok) return gate;

  const award = previewAward(s, entry.quest);
  const skills = { ...s.player.skills };
  for (const [code, xp] of Object.entries(award.perSkill) as [SkillCode, number][]) {
    const st = skills[code];
    skills[code] = { xp: st.xp + xp, idleDays: 0, earnedToday: st.earnedToday + xp };
  }
  const from = playerLevels.levelFor(s.player.totalXp);
  const totalXp = s.player.totalXp + award.totalXp;
  const to = playerLevels.levelFor(totalXp);

  return {
    ok: true,
    award,
    levelUp: to > from ? { from, to } : null,
    session: {
      ...s,
      player: { ...s.player, totalXp, rested: s.player.rested - award.restedConsumed, skills },
      quests: s.quests.map(e => e === entry ? { ...e, status: "done", awardedXp: award.totalXp } : e),
    },
  };
}

// ---------- Movement & fog ----------

const WALK_MPS = 1.4;
const FIX_INTERVAL_S = 10;

/** Simulated GPS fixes for walking in a straight line to target, one every 10 s. Stands in for expo-location. */
export function planWalk(from: Fix, to: { lat: number; lng: number }): Fix[] {
  const d = greatCircleDistance([from.lat, from.lng], [to.lat, to.lng], "m");
  if (!Number.isFinite(d)) return [];
  const steps = Math.max(1, Math.ceil(d / (WALK_MPS * FIX_INTERVAL_S)));
  const fixes: Fix[] = [];
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    fixes.push({
      lat: from.lat + (to.lat - from.lat) * k,
      lng: from.lng + (to.lng - from.lng) * k,
      t: from.t + i * FIX_INTERVAL_S * 1000,
      accuracyM: 4 + ((i * 7) % 5),  // real receivers jitter; a constant value trips the too_perfect check
    });
  }
  return fixes;
}

/** Run fixes through the same validation and reveal the server applies. Returns how many cells were new. */
export function applyFixes(s: Session, fixes: Fix[]): { session: Session; revealed: number } {
  if (fixes.length === 0) return { session: s, revealed: 0 };
  const { accepted } = validateFixes(fixes, s.position, fixes[fixes.length - 1].t);
  if (accepted.length === 0) return { session: s, revealed: 0 };

  const explored = new Set(s.explored);
  const newCells = new Set(s.newCells);
  let revealed = 0;
  for (const c of revealCells(accepted)) {
    if (explored.has(c)) continue;
    explored.add(c);
    newCells.add(c);
    revealed++;
  }
  const { speedMps: _, ...position } = accepted[accepted.length - 1];
  return { session: { ...s, explored, newCells, position }, revealed };
}

export function walkTo(s: Session, to: { lat: number; lng: number }) {
  return applyFixes(s, planWalk(s.position, to));
}

/**
 * Place the player at the first real GPS fix of an app run. It is validated with no previous fix, so a player
 * who opens the app far from where they last were isn't rejected as a teleport; the server treats a new
 * session the same way. The cells around the fix are revealed, since the player is standing there.
 */
export function spawnAt(s: Session, fix: Fix): { session: Session; revealed: number } {
  const { accepted } = validateFixes([fix], null, fix.t);
  if (accepted.length === 0) return { session: s, revealed: 0 };
  const explored = new Set(s.explored);
  const newCells = new Set(s.newCells);
  let revealed = 0;
  for (const c of revealCells(accepted)) {
    if (explored.has(c)) continue;
    explored.add(c);
    newCells.add(c);
    revealed++;
  }
  return { session: { ...s, explored, newCells, position: fix }, revealed };
}

// ---------- HUD view model ----------

export interface Hud {
  level: number;
  into: number;
  need: number;
  pct: number;
  restedPct: number;                 // rested XP as a fraction of this level, drawn ahead of the fill
  streakDays: number;
  streakMult: number;
  skills: { code: SkillCode; level: number; pct: number; form: number }[];
  district: { id: string; name: string; pct: number; next: (typeof DISTRICT_MILESTONES)[number] | null };
  questsDone: number;
  questsTotal: number;
}

export function hud(s: Session): Hud {
  const p = playerLevels.progress(s.player.totalXp);
  const district = districtOf(latLngToCell(s.position.lat, s.position.lng, FOG_RES));
  let inDistrict = 0;
  for (const c of s.explored) if (districtOf(c) === district) inDistrict++;
  const pct = districtProgress(inDistrict);

  return {
    level: p.level,
    into: p.into,
    need: p.need,
    pct: p.pct,
    restedPct: Math.min(1 - p.pct, s.player.rested / p.need),
    streakDays: s.player.streakDays,
    streakMult: streakMult(s.player.streakDays),
    skills: SKILLS.map(code => {
      const st = s.player.skills[code];
      const sp = skillLevels.progress(st.xp);
      return { code, level: sp.level, pct: sp.pct, form: skillForm(st.idleDays) };
    }),
    district: {
      id: district,
      name: s.districtNames[district] ?? "Uncharted",   // a phrase: translated on screen
      pct,
      next: DISTRICT_MILESTONES.find(m => m.pct > pct) ?? null,
    },
    questsDone: s.quests.filter(e => e.status === "done").length,
    questsTotal: s.quests.length,
  };
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
