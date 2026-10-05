// Character creation: turn onboarding answers into a fresh player through the pillar 4 calibration engine.
// Pure; the screens live in ui/onboarding/.
import { calibrate, type OnboardingAnswers } from "../../../src/onboarding/calibration";
import { playerLevels, type SkillCode } from "../../../src/xp/xp-engine";
import { MOCK_QUESTS } from "./mock-world";
import { SKILLS, type Player, type Session } from "./session";

/** Every Life Load card is skippable, and a skip scores zero load (pillar 4 §0.2). These are those zero-load answers. */
export const SKIPPED: OnboardingAnswers = {
  age: 25,
  workHoursPerWeek: "0",
  shiftWork: false,
  commuteMinutesOneWay: "0-15",
  dependents: { childrenUnder5: 0, childrenOlder: 0, caregivingAdult: false },
  income: "stable",
  debtStress: 0,
  healthLimit: "none",
  sleepHours: "7+",
  lifeEvents12m: [],
  support: 0,
  transport: "walk_only",
  achievements: [],
  focusClass: "sage",
  goals: [],
};

/** The tutorial quest every new player finishes by finishing onboarding (flow step I). */
export const CREATION_QUEST = { title: "Complete character creation", xp: 100 } as const;

export type Calibration = ReturnType<typeof calibrate>;

export function newPlayer(name: string, answers: OnboardingAnswers, now: number): { player: Player; calibration: Calibration } {
  const c = calibrate(answers);
  const skills = {} as Player["skills"];
  for (const code of SKILLS as SkillCode[]) skills[code] = { xp: c.backstory.perSkill[code], idleDays: 0, earnedToday: 0 };
  return {
    calibration: c,
    player: {
      name: name.trim() || "Adventurer",
      difficulty: c.xpMode,
      totalXp: c.backstory.total + CREATION_QUEST.xp,
      rested: 0,
      streakDays: 0,
      skills,
      profile: {
        calibrationVersion: c.version,
        className: answers.focusClass,
        classNode: c.classNode,
        calibratedMode: c.calibratedMode,
        rulesMode: c.rulesMode,
        lifeLoad: c.lifeLoad.total,
        constraints: c.constraints,
        targetEffort: c.targetEffort,
        answers,
        createdAt: now,
      },
    },
  };
}

/**
 * Replace whoever was playing with the new character. The explored map and position stay: they are the
 * player's real streets. Today's quests start over for the new character.
 */
export function startGame(s: Session, name: string, answers: OnboardingAnswers, now = Date.now()) {
  const { player, calibration } = newPlayer(name, answers, now);
  const levelUp = { from: playerLevels.levelFor(calibration.backstory.total), to: playerLevels.levelFor(player.totalXp) };
  return {
    session: { ...s, player, quests: MOCK_QUESTS.map(quest => ({ quest, status: "open" as const })), newCells: new Set<string>() },
    calibration,
    levelUp: levelUp.to > levelUp.from ? levelUp : null,
  };
}
