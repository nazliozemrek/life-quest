import { describe, expect, it } from "vitest";
import { createSession } from "../src/game/mock-world";
import { SKIPPED, startGame } from "../src/game/onboarding";
import { activeGoals, applySetup, type Goal } from "../src/game/setup";
import { MAIN_QUEST_XP, finishBlocker, finishGoal } from "../src/game/mainquest";
import { goalOp, goalsOp } from "../src/net/outbox";
import { restore, serialize } from "../src/game/persist";
import { feedLine } from "../src/game/social";
import { translate } from "../src/i18n";

const NOW = Date.UTC(2026, 9, 6, 7, 0);
const goals: Goal[] = [
  { id: "g1", title: "Run a 5K", horizon: "month", skill: "vitality" },
  { id: "g2", title: "Call grandma", horizon: "week", skill: null },
];
const player = (day = "2026-10-06") =>
  applySetup(startGame(createSession(NOW), "Kaan", SKIPPED, NOW).session, goals, [], day);

describe("main quests", () => {
  it("stamps the start day and keeps it across edits", () => {
    const s = player("2026-10-01");
    expect(s.player.profile!.goals!.map(g => g.createdAt)).toEqual(["2026-10-01", "2026-10-01"]);
    const edited = applySetup(s, [...activeGoals(s.player.profile!.goals), { id: "g3", title: "Read", horizon: "year", skill: "mindset" }], [], "2026-10-04");
    expect(edited.player.profile!.goals!.map(g => g.createdAt)).toEqual(["2026-10-01", "2026-10-01", "2026-10-04"]);
  });

  it("waits a few days before a goal can be claimed", () => {
    const g = player("2026-10-01").player.profile!.goals![0];
    expect(finishBlocker(g, "2026-10-05")?.params).toEqual({ n: 6 });
    expect(finishBlocker(g, "2026-10-10")?.key).toBe("goal.tooSoonOne");
    expect(finishBlocker(g, "2026-10-11")).toBeNull();
  });

  it("pays once, into the goal's skill, and frees the slot", () => {
    const s = player("2026-10-01");
    const r = finishGoal(s, "g1", "2026-10-11");
    if (!r.ok) throw new Error(r.reason.key);
    expect(r.xp).toBe(MAIN_QUEST_XP.month);
    expect(r.session.player.totalXp).toBe(s.player.totalXp + 400);
    expect(r.session.player.skills.vitality.xp).toBe(s.player.skills.vitality.xp + 400);
    expect(activeGoals(r.session.player.profile!.goals).map(g => g.id)).toEqual(["g2"]);
    const again = finishGoal(r.session, "g1", "2026-10-12");
    expect(again.ok).toBe(false);
  });

  it("spreads a goal with no skill over all five", () => {
    const r = finishGoal(player("2026-10-01"), "g2", "2026-10-05");
    if (!r.ok) throw new Error(r.reason.key);
    expect(Object.values(r.split).reduce((a, b) => a + (b ?? 0), 0)).toBe(150);
    expect(Object.keys(r.split)).toHaveLength(5);
  });

  it("keeps finished goals through edits, and never sends them as active", () => {
    const r = finishGoal(player("2026-10-01"), "g1", "2026-10-11");
    if (!r.ok) throw new Error(r.reason.key);
    const edited = applySetup(r.session, activeGoals(r.session.player.profile!.goals), [], "2026-10-11");
    expect(edited.player.profile!.goals!.find(g => g.id === "g1")?.doneAt).toBe("2026-10-11");
    const op = goalsOp(edited.player.profile!.goals!);
    expect(op.op === "goals" && op.goals.map(g => g.id)).toEqual(["g2"]);
    const xp = goalOp(r.goal, r.xp, r.split as Record<string, number>);
    expect(xp.op === "xp" && xp.key).toBe("goal:month:g1");
  });

  it("dates goals from older saves by the save's day", () => {
    const s = startGame(createSession(NOW), "Kaan", SKIPPED, NOW).session;
    const old = { ...s, player: { ...s.player, profile: { ...s.player.profile!, goals, setupDone: true } } };
    const back = restore(JSON.stringify(serialize(old, "2026-10-05")), "2026-10-05", () => createSession(NOW));
    expect(back.player.profile!.goals!.every(g => g.createdAt === "2026-10-05")).toBe(true);
  });

  it("has a feed line in both languages", () => {
    for (const skill of ["wealth", null] as const) {
      const m = feedLine({ kind: "main_quest", skill, horizon: "year" });
      for (const lang of ["en", "tr"] as const) expect(translate(lang, m.key, m.params)).not.toMatch(/\{|social\./);
    }
  });
});
