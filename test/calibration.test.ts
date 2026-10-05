import { describe, expect, it } from "vitest";
import { BACKSTORY_CAP, calibrate, resolveMode, type OnboardingAnswers } from "../src/onboarding/calibration.ts";
import { playerLevels } from "../src/xp/xp-engine.ts";

const base: OnboardingAnswers = {
  age: 30, workHoursPerWeek: "20-40", shiftWork: false, commuteMinutesOneWay: "15-45",
  dependents: { childrenUnder5: 0, childrenOlder: 0, caregivingAdult: false }, income: "stable", debtStress: 1,
  healthLimit: "none", sleepHours: "6-7", lifeEvents12m: [], support: 3, transport: "transit",
  achievements: ["degree"], focusClass: "sage", goals: [],
};

const personas: Record<string, [OnboardingAnswers, string]> = {
  retiree: [{ ...base, age: 67, workHoursPerWeek: "0", commuteMinutesOneWay: "0-15", healthLimit: "mild", sleepHours: "7+", debtStress: 0,
    achievements: ["degree", "raised_children", "emergency_fund", "long_friendships", "debt_free", "led_team"] }, "peaceful"],
  office_worker: [base, "normal"],
  student: [{ ...base, age: 20, workHoursPerWeek: "<20", income: "variable", debtStress: 2, lifeEvents12m: ["exams"], achievements: [] }, "normal"],
  new_parent: [{ ...base, age: 31, dependents: { childrenUnder5: 1, childrenOlder: 0, caregivingAdult: false }, sleepHours: "<5",
    lifeEvents12m: ["new_baby"], support: 2 }, "hard"],
  night_nurse_single_parent: [{ ...base, age: 38, workHoursPerWeek: "40-50", shiftWork: true, commuteMinutesOneWay: "45-90",
    dependents: { childrenUnder5: 1, childrenOlder: 1, caregivingAdult: false }, income: "variable", debtStress: 3, sleepHours: "5-6",
    lifeEvents12m: ["divorce_breakup"], support: 1, achievements: ["degree", "raised_children", "overcame_hardship"] }, "hardcore"],
};

describe("calibrate", () => {
  for (const [name, [answers, mode]] of Object.entries(personas)) {
    it(`puts the ${name.replace(/_/g, " ")} on ${mode}`, () => expect(calibrate(answers).calibratedMode).toBe(mode));
  }
  it("never starts anyone above level 8", () => {
    const r = calibrate({ ...base, age: 80, achievements: [
      "degree", "trade_cert", "endurance_race", "regular_training_1y", "quit_addiction", "built_something",
      "learned_language", "creative_work_shared", "emergency_fund", "debt_free", "career_promotion",
      "started_business", "public_speaking", "led_team", "long_friendships", "therapy_or_meditation_habit",
      "raised_children", "overcame_hardship"] });
    expect(r.backstory.total).toBeLessThanOrEqual(BACKSTORY_CAP);
    expect(playerLevels.levelFor(r.backstory.total)).toBeLessThanOrEqual(8);
  });
  it("emits constraint tags for the quest generator", () => {
    expect(calibrate(personas.night_nurse_single_parent[0]).constraints).toContain("works night or rotating shifts");
  });
});

describe("resolveMode", () => {
  it("allows easier freely and one step harder without extra XP", () => {
    expect(resolveMode("hard", "hardcore")).toEqual({ rulesMode: "hardcore", xpMode: "hard" });
    expect(resolveMode("hard", "peaceful")).toEqual({ rulesMode: "peaceful", xpMode: "peaceful" });
    expect(resolveMode("normal", "hardcore")).toEqual({ rulesMode: "hard", xpMode: "normal" });
  });
});
