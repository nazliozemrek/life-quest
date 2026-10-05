import { describe, expect, it } from "vitest";
import { computeAward, playerLevels, repeatMult, skillForm, streakMult, xpToNext, type AwardInput } from "../src/xp/xp-engine.ts";

const sk = (level: number, idleDays = 0, earnedToday = 0) => ({ level, idleDays, earnedToday });
const skills = { vitality: sk(5), craft: sk(3), wealth: sk(2), charisma: sk(1), mindset: sk(4, 30) };
const base: AwardInput = {
  tier: "standard", skillWeights: { vitality: 0.7, mindset: 0.3 }, difficulty: "hard", verification: "sensor",
  streakDays: 7, repeatIndex: 1, rested: 0, skills,
};

describe("level curve", () => {
  it("matches the documented table", () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(2)).toBe(214);
    expect(playerLevels.xpToReach(10)).toBe(5369);
    expect(playerLevels.xpToReach(50)).toBe(172350);
  });
  it("maps XP to levels at the boundaries", () => {
    expect(playerLevels.levelFor(0)).toBe(1);
    expect(playerLevels.levelFor(99)).toBe(1);
    expect(playerLevels.levelFor(100)).toBe(2);
    expect(playerLevels.progress(146000).level).toBe(46);
  });
});

describe("multipliers", () => {
  it("streak approaches 1.5", () => {
    expect(streakMult(0)).toBe(1);
    expect(streakMult(7)).toBeCloseTo(1.197, 3);
    expect(streakMult(1000)).toBeCloseTo(1.5, 5);
  });
  it("repeats decay", () => expect([1, 2, 3, 4].map(repeatMult)).toEqual([1, 1 / 1.5, 0.5, 0.4]));
  it("form floors at 0.5", () => {
    expect(skillForm(14)).toBeCloseTo(0.5);
    expect(skillForm(365)).toBe(0.5);
  });
});

describe("computeAward", () => {
  it("prices the worked example from the spec", () => {
    const r = computeAward(base);
    expect(r.perSkill).toEqual({ vitality: 69, mindset: 37 });
    expect(r.totalXp).toBe(106);
  });
  it("applies repeat decay, self-report, soft cap and rested", () => {
    const r = computeAward({
      ...base, skillWeights: { vitality: 1 }, difficulty: "normal", verification: "self", streakDays: 0,
      repeatIndex: 3, rested: 20, skills: { ...skills, vitality: sk(5, 0, 370) },
    });
    expect(r.totalXp).toBe(16);
    expect(r.restedConsumed).toBe(8);
  });
  it("rejects weights that do not sum to 1", () => {
    expect(() => computeAward({ ...base, skillWeights: { vitality: 0.5 } })).toThrow(/sum/);
  });
});
