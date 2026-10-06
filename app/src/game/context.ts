// What the quest generator knows about the player (pillar 3 PlayerContext), built from the local session.
// Sent to the daily-quests function, and used offline to pick today's set from the pool.
import { gridDisk, greatCircleDistance, cellToLatLng, latLngToCell } from "h3-js";
import type { PlayerContext } from "../../../src/quests/quest-generator";
import { pickDailySet } from "../../../src/quests/quest-pool";
import { DISTRICT_RES, districtOf } from "../../../src/spatial/spatial-engine";
import { playerLevels, skillForm, skillLevels } from "../../../src/xp/xp-engine";
import { SKILLS, type QuestEntry, type Session } from "./session";
import { focusSkills as treeFocus } from "./skilltree";
import { activeGoals } from "./setup";

export const DAILY_COUNT = 6;
const CELLS_PER_DISTRICT = 343;

/** The districts around the player, least explored first: where exploration quests should point. */
export function frontierDistricts(s: Session, limit = 3): PlayerContext["frontierDistricts"] {
  const here = latLngToCell(s.position.lat, s.position.lng, DISTRICT_RES);
  const explored = new Map<string, number>();
  for (const c of s.explored) {
    const d = districtOf(c);
    explored.set(d, (explored.get(d) ?? 0) + 1);
  }
  return gridDisk(here, 1)
    .filter(d => d !== here)
    .map(id => ({
      id,
      pctExplored: +((explored.get(id) ?? 0) / CELLS_PER_DISTRICT).toFixed(3),
      distanceKm: +(greatCircleDistance([s.position.lat, s.position.lng], cellToLatLng(id), "km")).toFixed(1),
    }))
    .sort((a, b) => a.pctExplored - b.pctExplored || a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export function playerContext(s: Session, now: Date): Omit<PlayerContext, "playerId"> {
  const p = s.player;
  const skills = {} as PlayerContext["skills"];
  for (const code of SKILLS) {
    skills[code] = { level: skillLevels.levelFor(p.skills[code].xp), form: +skillForm(p.skills[code].idleDays).toFixed(2) };
  }
  const offsetMin = -now.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const local = new Date(now.getTime() + offsetMin * 60_000).toISOString().slice(0, 19)
    + `${offsetMin >= 0 ? "+" : "-"}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`;
  return {
    locale: Intl.DateTimeFormat().resolvedOptions().locale ?? "en-US",
    localTime: local,
    difficulty: p.difficulty,
    level: playerLevels.levelFor(p.totalXp),
    skills,
    streakDays: p.streakDays,
    constraints: p.profile?.constraints ?? [],
    goals: activeGoals(p.profile?.goals).map(g => ({ id: g.id, title: g.title, horizon: g.horizon })),
    completionRate14d: {},
    targetEffort: p.profile?.targetEffort ?? 1,
    recentQuestTitles: s.quests.map(e => e.quest.title),
    // Kind and name only, never coordinates. Before setup the map still holds the sample Moda places: send none.
    waypoints: p.profile?.setupDone ? s.waypoints.map(w => ({ id: w.id, kind: w.kind, name: w.name })) : [],
    frontierDistricts: frontierDistricts(s),
    request: { kind: "daily_set", count: DAILY_COUNT },
  };
}

/** Today's set from the on-device pool: what the player gets offline, until the server's set arrives. */
export function poolQuests(s: Session, day: string): QuestEntry[] {
  const ctx = playerContext(s, new Date());
  const seed = `${s.player.profile?.createdAt ?? "guest"}:${day}`;
  // Goals first, then skills whose tree Path says so.
  const focus = [...activeGoals(s.player.profile?.goals).flatMap(g => (g.skill ? [g.skill] : [])), ...treeFocus(s.player)];
  const focusSkills = [...new Set(focus)];
  return pickDailySet(ctx, seed, DAILY_COUNT, { focusSkills }).map(quest => ({ quest, status: "open" as const }));
}
