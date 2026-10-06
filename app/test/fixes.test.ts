// Fixes from the 2026-10-06 review: each test is a bug a player could hit.
import { describe, expect, it } from "vitest";
import { accrueRested, computeAward } from "../../src/xp/xp-engine";
import { createSession, MOCK_QUESTS } from "../src/game/mock-world";
import { SKIPPED, startGame } from "../src/game/onboarding";
import { poolQuests } from "../src/game/context";
import { restore, rollover, serialize } from "../src/game/persist";
import { cloudSave, fromCloud } from "../src/game/cloudsave";
import { completeQuest, hud, previewAward, shownStreak } from "../src/game/session";
import { treeStatus } from "../src/game/skilltree";
import { flush, isPermanent, type Db, type SyncOp } from "../src/net/outbox";

const NOW = Date.UTC(2026, 9, 5, 7, 0);
const fresh = () => createSession(NOW);

describe("rested XP", () => {
  it("is always whole, so the server's int columns take it", () => {
    for (let level = 1; level < 30; level++) {
      for (let days = 0; days < 10; days++) expect(Number.isInteger(accrueRested(0, days, level))).toBe(true);
    }
    const s = fresh();
    const r = computeAward({
      tier: "standard", skillWeights: { craft: 1 }, difficulty: "normal", verification: "self", streakDays: 3,
      repeatIndex: 1, rested: 10.7, skills: Object.fromEntries(Object.keys(s.player.skills).map(k => [k, { level: 2, idleDays: 0, earnedToday: 0 }])) as never,
    });
    expect(Number.isInteger(r.restedConsumed)).toBe(true);
    expect(Number.isInteger(r.totalXp)).toBe(true);
  });

  it("repairs a save that already holds fractions", () => {
    const s = fresh();
    const raw = JSON.stringify(serialize({ ...s, player: { ...s.player, rested: 10.7, totalXp: 300.7 } }, "2026-10-05"));
    const back = restore(raw, "2026-10-05", fresh);
    expect(back.player.rested).toBe(10);
    expect(back.player.totalXp).toBe(300);
  });
});

describe("outbox", () => {
  const xpOp = (key: string, xp: number): SyncOp => ({ op: "xp", key, source: "quest", title: "t", xp, split: { craft: xp - 0.7 }, rested: 0.7, multipliers: {} });

  it("sends whole numbers even for ops queued by an older build", async () => {
    const rows: any[] = [];
    const db: Db = { from: () => ({ upsert: async r => { rows.push(r); return { error: null }; }, insert: async () => ({ error: null }), delete: () => ({ like: async () => ({ error: null }) }) }) };
    await flush(db, [xpOp("quest:2026-10-05:q1", 70.7)], new Set(), new Set());
    expect(rows[0]).toMatchObject({ final_xp: 70, rested_consumed: 0, skill_split: { craft: 70 } });
  });

  it("skips a row the server will never take instead of blocking everything after it", async () => {
    const sent: string[] = [];
    const db: Db = {
      from: () => ({
        upsert: async (r: any) => { sent.push(r.idempotency_key); return { error: r.idempotency_key === "bad" ? { code: "22P02" } : null }; },
        insert: async () => ({ error: null }), delete: () => ({ like: async () => ({ error: null }) }),
      }),
    };
    const r = await flush(db, [xpOp("bad", 10), xpOp("quest:2026-10-05:q2", 10)], new Set(), new Set());
    expect(sent).toEqual(["bad", "quest:2026-10-05:q2"]);
    expect(r.remaining).toEqual([]);
  });

  it("keeps retrying network errors and a player row that isn't there yet", () => {
    expect(isPermanent({ code: "23503" })).toBe(false);
    expect(isPermanent("down")).toBe(false);
    expect(isPermanent({ code: "23514" })).toBe(true);
  });
});

describe("the day turning over while the app is open", () => {
  it("rolls over exactly like a restore the next morning", () => {
    const s0 = restore(null, "2026-10-05", fresh, poolQuests);
    expect(s0.day).toBe("2026-10-05");
    const r = completeQuest(s0, s0.quests[0].quest.local_id);
    if (!r.ok) throw new Error(r.reason.key);
    const next = rollover(r.session, "2026-10-06", fresh, poolQuests);
    expect(next.day).toBe("2026-10-06");
    expect(next.player.streakDays).toBe(r.session.player.streakDays + 1);
    expect(next.quests.every(e => e.status === "open")).toBe(true);
    expect(Object.values(next.player.skills).every(st => st.earnedToday === 0)).toBe(true);
    expect(rollover(next, "2026-10-06", fresh, poolQuests)).toBe(next);
  });
});

describe("restoring", () => {
  it("never leaves a blank screen on a save it can't read", () => {
    const s = fresh();
    const broken = JSON.stringify({ ...serialize(s, "2026-10-05"), player: { ...s.player, skills: undefined } });
    expect(() => restore(broken, "2026-10-06", fresh)).not.toThrow();
    expect(restore(broken, "2026-10-06", fresh).player.totalXp).toBe(fresh().player.totalXp);
  });

  it("asks a restored character for their places again instead of using the sample ones", () => {
    const s = startGame(fresh(), "Kaan", SKIPPED, NOW).session;
    const done = { ...s, player: { ...s.player, profile: { ...s.player.profile!, setupDone: true, goals: [{ id: "g1", title: "Run", horizon: "month" as const, skill: null }] } } };
    const old = { ...cloudSave(done, "2026-10-05"), player: done.player };     // uploaded by an older build
    for (const save of [cloudSave(done, "2026-10-05"), old]) {
      const back = fromCloud(save, [], "2026-10-05", fresh, poolQuests);
      expect(back.player.profile!.setupDone).toBe(false);
      expect(back.player.profile!.goals).toHaveLength(1);
    }
  });
});

describe("generated quests", () => {
  it("prices a quest that names a skill twice instead of crashing", () => {
    const s = fresh();
    const q = { ...MOCK_QUESTS[1], skill_weights: [{ skill: "craft" as const, weight: 0.5 }, { skill: "craft" as const, weight: 0.5 }] };
    expect(() => previewAward(s, q)).not.toThrow();
  });
});

describe("what the HUD and trees say", () => {
  it("counts today in the streak once a quest is done", () => {
    const s = restore(null, "2026-10-05", fresh, poolQuests);
    expect(shownStreak(s)).toBe(s.player.streakDays);
    const r = completeQuest(s, s.quests[0].quest.local_id);
    if (!r.ok) throw new Error(r.reason.key);
    expect(hud(r.session).streakDays).toBe(s.player.streakDays + 1);
  });

  it("says when saved points can't be spent yet", () => {
    const s = startGame(fresh(), "Kaan", { ...SKIPPED, focusClass: "artisan" }, NOW).session;
    const st = treeStatus(s.player, "craft");      // the class tree: root is free, the next nodes need level 3
    expect(st.canBuy).toBe(false);
    expect(st.nextLevel).toBeGreaterThan(1);
  });
});
