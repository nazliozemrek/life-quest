// Life Quest — XP engine (pillar 1). Pure functions, no I/O.
// Curve version is stamped on every ledger row so tuning changes are replayable.

export const CURVE_VERSION = 1;

export type DifficultyMode = "peaceful" | "normal" | "hard" | "hardcore";
export type SkillCode = "vitality" | "craft" | "wealth" | "charisma" | "mindset";
export type QuestTier = "trivial" | "minor" | "standard" | "major" | "epic" | "boss";
export type Verification = "self" | "evidence" | "sensor";

export const CURVE = {
  player: { base: 100, alpha: 1.1 },
  skill: { base: 60, alpha: 1.1 },
} as const;

export const TIER_BASE_XP: Record<QuestTier, number> = {
  trivial: 10, minor: 25, standard: 60, major: 150, epic: 400, boss: 1500,
};

export const DIFFICULTY_MULT: Record<DifficultyMode, number> = {
  peaceful: 0.8, normal: 1.0, hard: 1.2, hardcore: 1.4,
};

export const VERIFY_MULT: Record<Verification, number> = {
  self: 0.7, evidence: 1.0, sensor: 1.15,
};

// ---------- Level curve ----------

/** XP required to go from level L to L+1. XP_next = Base * L^alpha */
export function xpToNext(level: number, c: { base: number; alpha: number } = CURVE.player): number {
  return Math.round(c.base * Math.pow(level, c.alpha));
}

/** Lazily-extended cumulative table: cum[L] = total XP needed to *reach* level L. */
function makeLevelTable(c: { base: number; alpha: number }) {
  const cum: number[] = [0, 0]; // index 0 unused, level 1 starts at 0
  const ensure = (xp: number) => {
    while (cum[cum.length - 1] <= xp) {
      const L = cum.length - 1;
      cum.push(cum[L] + xpToNext(L, c));
    }
  };
  return {
    levelFor(totalXp: number): number {
      ensure(totalXp);
      let lo = 1, hi = cum.length - 1; // largest L with cum[L] <= totalXp
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (cum[mid] <= totalXp) lo = mid; else hi = mid - 1;
      }
      return lo;
    },
    progress(totalXp: number) {
      const level = this.levelFor(totalXp);
      const into = totalXp - cum[level];
      const need = cum[level + 1] - cum[level];
      return { level, into, need, pct: into / need };
    },
    xpToReach(level: number): number {
      while (cum.length - 1 < level) ensure(cum[cum.length - 1]);
      return cum[level];
    },
  };
}

export const playerLevels = makeLevelTable(CURVE.player);
export const skillLevels = makeLevelTable(CURVE.skill);

// ---------- Multipliers ----------

/** Asymptotic streak bonus: 1.0 -> 1.5, ~1.2 at 7 days, ~1.32 at 14, ~1.44 at 30. */
export function streakMult(streakDays: number): number {
  return 1 + 0.5 * (1 - Math.exp(-Math.max(0, streakDays) / 14));
}

/** k-th completion of the same template inside a rolling 24h window (k >= 1). */
export function repeatMult(k: number): number {
  return 1 / (1 + 0.5 * (Math.max(1, k) - 1)); // 1, .67, .5, .4, ...
}

/** Skill Form: decays with idle days (half-life 14d), floor 0.5. Levels never drop. */
export function skillForm(idleDays: number): number {
  return Math.max(0.5, Math.pow(0.5, Math.max(0, idleDays) / 14));
}

/** "Muscle memory": returning to a rusty skill earns up to +25%. */
export function comebackMult(form: number): number {
  return 1 + 0.5 * (1 - form);
}

/** Per-skill daily soft cap; XP past it is paid at 20%. */
export function dailySkillCap(skillLevel: number): number {
  return 250 + 25 * skillLevel;
}
export const OVER_CAP_RATE = 0.2;

// ---------- Rested XP ----------

/** Rested pool grows 5% of the current level's requirement per idle day, max 150%. Whole XP only: the ledger stores ints. */
export function accrueRested(pool: number, idleDays: number, playerLevel: number): number {
  const need = xpToNext(playerLevel);
  return Math.floor(Math.min(1.5 * need, pool + 0.05 * need * Math.max(0, idleDays)));
}

// ---------- Award ----------

export interface AwardInput {
  tier: QuestTier;
  effort?: number;                         // 0.5..2.0, set by quest generator / template
  skillWeights: Partial<Record<SkillCode, number>>; // must sum to 1
  difficulty: DifficultyMode;
  verification: Verification;
  streakDays: number;
  repeatIndex: number;                     // k for this template in last 24h (incl. this one)
  rested: number;                          // current rested pool
  skills: Record<SkillCode, { level: number; idleDays: number; earnedToday: number }>;
}

export interface AwardResult {
  totalXp: number;
  perSkill: Partial<Record<SkillCode, number>>;
  restedConsumed: number;
  multipliers: Record<string, number>;     // snapshot persisted to the ledger
  curveVersion: number;
}

export function computeAward(i: AwardInput): AwardResult {
  const weightSum = Object.values(i.skillWeights).reduce((a, b) => a + (b ?? 0), 0);
  if (Math.abs(weightSum - 1) > 1e-6) throw new Error(`skillWeights sum to ${weightSum}, expected 1`);

  const effort = Math.min(2, Math.max(0.5, i.effort ?? 1));
  const m = {
    difficulty: DIFFICULTY_MULT[i.difficulty],
    streak: streakMult(i.streakDays),
    repeat: repeatMult(i.repeatIndex),
    verify: VERIFY_MULT[i.verification],
  };
  const gross = TIER_BASE_XP[i.tier] * effort * m.difficulty * m.streak * m.repeat * m.verify;

  // Split across skills, then apply per-skill comeback bonus and daily soft cap.
  const perSkill: Partial<Record<SkillCode, number>> = {};
  let net = 0;
  for (const [code, w] of Object.entries(i.skillWeights) as [SkillCode, number][]) {
    const s = i.skills[code];
    let xp = gross * w * comebackMult(skillForm(s.idleDays));
    const room = Math.max(0, dailySkillCap(s.level) - s.earnedToday);
    xp = Math.min(xp, room) + Math.max(0, xp - room) * OVER_CAP_RATE;
    perSkill[code] = Math.floor(xp);
    net += perSkill[code]!;
  }

  // Rested doubles XP until the pool is drained (bonus only, never affects skill caps).
  const restedConsumed = Math.floor(Math.min(i.rested, net));
  return {
    totalXp: net + restedConsumed,
    perSkill,
    restedConsumed,
    multipliers: { ...m, effort, tierBase: TIER_BASE_XP[i.tier] },
    curveVersion: CURVE_VERSION,
  };
}
