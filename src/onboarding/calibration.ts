// Life Quest — onboarding calibration (pillar 4).
// Answers -> Life Load score -> difficulty mode, starting XP, constraint tags for the quest generator.
import { playerLevels, skillLevels, type DifficultyMode, type SkillCode } from "../xp/xp-engine.ts";

export const CALIBRATION_VERSION = 1;

// ---------- Answers (one screen-card each) ----------

export interface OnboardingAnswers {
  age: number;
  workHoursPerWeek: "0" | "<20" | "20-40" | "40-50" | "50+";
  shiftWork: boolean;                       // nights / rotating shifts
  commuteMinutesOneWay: "0-15" | "15-45" | "45-90" | "90+";
  dependents: { childrenUnder5: number; childrenOlder: number; caregivingAdult: boolean };
  income: "stable" | "variable" | "precarious";
  debtStress: 0 | 1 | 2 | 3 | 4;            // "how much does money weigh on you?"
  healthLimit: "none" | "mild" | "significant";
  sleepHours: "<5" | "5-6" | "6-7" | "7+";
  lifeEvents12m: LifeEvent[];
  support: 0 | 1 | 2 | 3 | 4;               // "people you can count on"
  transport: "car" | "transit" | "bike" | "walk_only";
  achievements: AchievementCode[];
  focusClass: ClassCode;
  goals: { title: string; horizon: "week" | "month" | "year" }[];
  preferredMode?: DifficultyMode;           // player override, see resolveMode()
}

export type LifeEvent = "bereavement" | "divorce_breakup" | "job_loss" | "new_baby" | "serious_illness"
  | "move" | "new_job" | "exams" | "caring_crisis";

// Simplified from life-event stress scales; capped at 15 total.
const LIFE_EVENT_POINTS: Record<LifeEvent, number> = {
  bereavement: 8, divorce_breakup: 7, job_loss: 7, serious_illness: 7, new_baby: 6,
  caring_crisis: 6, move: 3, new_job: 3, exams: 3,
};

// ---------- Life Load ----------

export interface LifeLoad {
  total: number;                            // 0..100
  domains: { time: number; money: number; health: number; events: number; support: number };
}

export function scoreLifeLoad(a: OnboardingAnswers): LifeLoad {
  const work = { "0": 0, "<20": 4, "20-40": 12, "40-50": 16, "50+": 20 }[a.workHoursPerWeek];
  const commute = { "0-15": 0, "15-45": 2, "45-90": 4, "90+": 6 }[a.commuteMinutesOneWay];
  const kids = Math.min(14, a.dependents.childrenUnder5 * 8 + a.dependents.childrenOlder * 3);
  const time = Math.min(35, work + (a.shiftWork ? 5 : 0) + commute + kids + (a.dependents.caregivingAdult ? 8 : 0));

  const money = Math.min(20, { stable: 0, variable: 5, precarious: 10 }[a.income] + a.debtStress * 2.5);

  const sleep = { "<5": 8, "5-6": 5, "6-7": 2, "7+": 0 }[a.sleepHours];
  const health = Math.min(20, { none: 0, mild: 6, significant: 12 }[a.healthLimit] + sleep);

  const events = Math.min(15, a.lifeEvents12m.reduce((s, e) => s + LIFE_EVENT_POINTS[e], 0));

  // Support buffers load: up to -6.
  const support = -1.5 * a.support;

  const total = clamp(Math.round(time + money + health + events + support), 0, 100);
  return { total, domains: { time, money, health, events, support } };
}

export const MODE_ORDER: DifficultyMode[] = ["peaceful", "normal", "hard", "hardcore"];

/** Thresholds on Life Load. Tuned so a typical full-time worker with no kids lands on Normal. */
export function calibratedMode(load: number): DifficultyMode {
  if (load < 12) return "peaceful";
  if (load < 35) return "normal";
  if (load < 55) return "hard";
  return "hardcore";
}

/**
 * Players may pick any easier mode freely, or one step harder for the challenge.
 * The XP multiplier never exceeds the calibrated mode's, so picking harder buys harsher rules, not more XP.
 */
export function resolveMode(calibrated: DifficultyMode, preferred?: DifficultyMode) {
  const c = MODE_ORDER.indexOf(calibrated);
  const p = preferred ? MODE_ORDER.indexOf(preferred) : c;
  const rules = MODE_ORDER[Math.min(p, c + 1)];
  const xpMode = MODE_ORDER[Math.min(p, c)];
  return { rulesMode: rules, xpMode };
}

// ---------- Backstory: starting XP ----------

export type AchievementCode =
  | "degree" | "trade_cert" | "endurance_race" | "regular_training_1y" | "quit_addiction"
  | "built_something" | "learned_language" | "creative_work_shared"
  | "emergency_fund" | "debt_free" | "career_promotion" | "started_business"
  | "public_speaking" | "led_team" | "long_friendships"
  | "therapy_or_meditation_habit" | "raised_children" | "overcame_hardship";

export const ACHIEVEMENTS: Record<AchievementCode, { skill: SkillCode; xp: number; label: string }> = {
  degree:                     { skill: "mindset",  xp: 600, label: "Earned a degree" },
  trade_cert:                 { skill: "craft",    xp: 600, label: "Earned a trade certification" },
  endurance_race:             { skill: "vitality", xp: 500, label: "Finished an endurance event" },
  regular_training_1y:        { skill: "vitality", xp: 600, label: "Trained regularly for a year" },
  quit_addiction:             { skill: "mindset",  xp: 700, label: "Quit smoking or another addiction" },
  built_something:            { skill: "craft",    xp: 500, label: "Built something real" },
  learned_language:           { skill: "charisma", xp: 500, label: "Learned another language" },
  creative_work_shared:       { skill: "craft",    xp: 400, label: "Shared creative work publicly" },
  emergency_fund:             { skill: "wealth",   xp: 500, label: "Saved an emergency fund" },
  debt_free:                  { skill: "wealth",   xp: 600, label: "Paid off a debt" },
  career_promotion:           { skill: "wealth",   xp: 400, label: "Got promoted" },
  started_business:           { skill: "wealth",   xp: 700, label: "Started a business" },
  public_speaking:            { skill: "charisma", xp: 400, label: "Spoke in front of a crowd" },
  led_team:                   { skill: "charisma", xp: 500, label: "Led a team" },
  long_friendships:           { skill: "charisma", xp: 300, label: "Kept friendships for 10+ years" },
  therapy_or_meditation_habit:{ skill: "mindset",  xp: 400, label: "Built a therapy or meditation habit" },
  raised_children:            { skill: "mindset",  xp: 600, label: "Raised kids" },
  overcame_hardship:          { skill: "mindset",  xp: 600, label: "Came through something hard" },
};

/** Backstory XP is capped so nobody starts above level 8: the early levels are the hook. */
export const BACKSTORY_CAP = playerLevels.xpToReach(8);
const PER_SKILL_CAP = skillLevels.xpToReach(6);

export function backstoryXp(a: OnboardingAnswers) {
  const perSkill: Record<SkillCode, number> = { vitality: 0, craft: 0, wealth: 0, charisma: 0, mindset: 0 };
  for (const code of new Set(a.achievements)) {
    const ach = ACHIEVEMENTS[code];
    perSkill[ach.skill] = Math.min(PER_SKILL_CAP, perSkill[ach.skill] + ach.xp);
  }
  // Life experience: 40 XP per adult year, split evenly, max 20 years.
  const adultYears = clamp(a.age - 18, 0, 20);
  for (const s of Object.keys(perSkill) as SkillCode[]) perSkill[s] += Math.round((adultYears * 40) / 5);

  let total = Object.values(perSkill).reduce((x, y) => x + y, 0);
  if (total > BACKSTORY_CAP) {
    const k = BACKSTORY_CAP / total;
    for (const s of Object.keys(perSkill) as SkillCode[]) perSkill[s] = Math.floor(perSkill[s] * k);
    total = Object.values(perSkill).reduce((x, y) => x + y, 0);
  }
  return { perSkill, total };
}

// ---------- Class ----------

export type ClassCode = "warrior" | "artisan" | "merchant" | "bard" | "sage";
export const CLASSES: Record<ClassCode, { skill: SkillCode; startingNode: string }> = {
  warrior:  { skill: "vitality", startingNode: "vitality.warriors_resolve" },
  artisan:  { skill: "craft",    startingNode: "craft.makers_hands" },
  merchant: { skill: "wealth",   startingNode: "wealth.ledger_sense" },
  bard:     { skill: "charisma", startingNode: "charisma.silver_tongue" },
  sage:     { skill: "mindset",  startingNode: "mindset.still_mind" },
};
// Each starting node: {"xp_mult": {<skill>: 0.05}}. +5% in your class skill, nothing else.

// ---------- Constraint tags for the quest generator (pillar 3 PlayerContext.constraints) ----------

export function constraintTags(a: OnboardingAnswers): string[] {
  const t: string[] = [];
  if (a.shiftWork) t.push("works night or rotating shifts");
  if (a.workHoursPerWeek === "50+") t.push("very long work hours");
  if (a.commuteMinutesOneWay === "45-90" || a.commuteMinutesOneWay === "90+") t.push("long commute");
  if (a.dependents.childrenUnder5 > 0) t.push("young children at home");
  if (a.dependents.caregivingAdult) t.push("caregiver for an adult");
  if (a.income === "precarious" || a.debtStress >= 3) t.push("tight budget, prefer free activities");
  if (a.healthLimit === "significant") t.push("health limits physical activity, keep vitality quests gentle");
  if (a.healthLimit === "mild") t.push("some physical limitations");
  if (a.sleepHours === "<5" || a.sleepHours === "5-6") t.push("short on sleep");
  if (a.transport === "walk_only") t.push("no vehicle, keep locations walkable");
  if (a.transport === "transit") t.push("no car, uses public transit");
  if (a.lifeEvents12m.some(e => ["bereavement", "divorce_breakup", "serious_illness", "caring_crisis"].includes(e)))
    t.push("going through a hard period, favor gentle and restorative quests");
  return t;
}

// ---------- Result ----------

export function calibrate(a: OnboardingAnswers) {
  const load = scoreLifeLoad(a);
  const calibrated = calibratedMode(load.total);
  const { rulesMode, xpMode } = resolveMode(calibrated, a.preferredMode);
  const backstory = backstoryXp(a);
  const startingEffort = { peaceful: 1.1, normal: 1.0, hard: 0.9, hardcore: 0.8 }[calibrated];
  return {
    version: CALIBRATION_VERSION,
    lifeLoad: load,
    calibratedMode: calibrated,
    rulesMode,
    xpMode,
    startingLevel: playerLevels.levelFor(backstory.total),
    startingSkillLevels: Object.fromEntries(
      Object.entries(backstory.perSkill).map(([s, xp]) => [s, skillLevels.levelFor(xp)])),
    backstory,
    targetEffort: startingEffort,
    constraints: constraintTags(a),
    classNode: CLASSES[a.focusClass].startingNode,
  };
}

function clamp(x: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, x)); }
