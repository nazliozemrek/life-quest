import { describe, expect, it } from "vitest";
import { calibrate, type OnboardingAnswers } from "../../src/onboarding/calibration";
import { createSession } from "../src/game/mock-world";
import { CREATION_QUEST, SKIPPED, newPlayer, startGame } from "../src/game/onboarding";
import { restore, serialize } from "../src/game/persist";
import { previewAward } from "../src/game/session";

const NOW = Date.UTC(2026, 9, 5, 7, 0);

const newParent: OnboardingAnswers = {
  ...SKIPPED, age: 31, workHoursPerWeek: "20-40", commuteMinutesOneWay: "15-45", income: "stable", debtStress: 1,
  dependents: { childrenUnder5: 1, childrenOlder: 0, caregivingAdult: false }, sleepHours: "<5",
  lifeEvents12m: ["new_baby"], support: 2, transport: "transit", achievements: ["degree"], focusClass: "sage",
};

describe("character creation", () => {
  it("scores every skipped card as zero load", () => {
    expect(calibrate(SKIPPED).lifeLoad.total).toBe(0);
    expect(calibrate(SKIPPED).calibratedMode).toBe("peaceful");
  });

  it("builds the player from calibrate(): backstory XP, XP mode, profile, plus the creation quest", () => {
    const c = calibrate(newParent);
    const { player } = newPlayer("  Kaan ", newParent, NOW);
    expect(player.name).toBe("Kaan");
    expect(player.difficulty).toBe(c.xpMode);
    expect(player.totalXp).toBe(c.backstory.total + CREATION_QUEST.xp);
    expect(player.skills.mindset.xp).toBe(c.backstory.perSkill.mindset);
    expect(player.streakDays).toBe(0);
    expect(player.profile).toMatchObject({ className: "sage", calibratedMode: "hard", rulesMode: "hard", constraints: c.constraints });
  });

  it("lets a player choose one step harder for the rules but keeps XP at the calibrated mode", () => {
    const { player } = newPlayer("Kaan", { ...newParent, preferredMode: "hardcore" }, NOW);
    expect(player.profile!.rulesMode).toBe("hardcore");
    expect(player.difficulty).toBe("hard");
  });

  it("keeps the explored map and position, and resets today's quests", () => {
    const s = createSession(NOW);
    const r = startGame(s, "Kaan", newParent, NOW);
    expect(r.session.explored).toBe(s.explored);
    expect(r.session.position).toEqual(s.position);
    expect(r.session.quests.every(e => e.status === "open")).toBe(true);
    expect(r.session.newCells.size).toBe(0);
  });

  it("pays the class skill 5% more", () => {
    const s = startGame(createSession(NOW), "Kaan", newParent, NOW).session;
    const mindsetQuest = s.quests.find(e => e.quest.skill_weights.length === 1 && e.quest.skill_weights[0].skill === "mindset")!.quest;
    const plain = previewAward({ ...s, player: { ...s.player, profile: undefined } }, mindsetQuest);
    const sage = previewAward(s, mindsetQuest);
    expect(sage.perSkill.mindset).toBe(plain.perSkill.mindset! + Math.floor(plain.perSkill.mindset! * 0.05));
    expect(sage.totalXp).toBeGreaterThan(plain.totalXp);
  });

  it("survives a save and restore, so onboarding runs once", () => {
    const s = startGame(createSession(NOW), "Kaan", newParent, NOW).session;
    const back = restore(JSON.stringify(serialize(s, "2026-10-05")), "2026-10-06", () => createSession(NOW));
    expect(back.player.profile).toEqual(s.player.profile);
  });

  it("asks a player from before onboarding existed to create a character", () => {
    expect(createSession(NOW).player.profile).toBeUndefined();
  });
});
