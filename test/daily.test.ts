import { describe, expect, it } from "vitest";
import { dailyQuests } from "../src/quests/daily.ts";
import { QuestBatchSchema, validateBatch, type PlayerContext, type Quest } from "../src/quests/quest-generator.ts";
import { POOL, pickDailySet, toQuest } from "../src/quests/quest-pool.ts";

const ctx: PlayerContext = {
  playerId: "p1", locale: "en-US", localTime: "2026-10-05T07:30:00+03:00", difficulty: "hard", level: 6,
  skills: {
    vitality: { level: 2, form: 1 }, craft: { level: 4, form: 1 }, wealth: { level: 2, form: 0.4 },
    charisma: { level: 4, form: 0.9 }, mindset: { level: 5, form: 1 },
  },
  streakDays: 0, constraints: [], goals: [], completionRate14d: {}, targetEffort: 1,
  recentQuestTitles: [], waypoints: [], frontierDistricts: [{ id: "871ec902effffff", pctExplored: 0, distanceKm: 1 }],
  request: { kind: "daily_set", count: 6 },
};

describe("quest pool", () => {
  it("every pool quest passes the generator's own contract and validator", () => {
    const quests = POOL.map((p, i) => toQuest(p, `q${i + 1}`, 1));
    const batch = { quests };
    for (let i = 0; i < quests.length; i += 8) QuestBatchSchema.parse({ quests: quests.slice(i, i + 8) });
    expect(validateBatch(batch, { ...ctx, request: { kind: "on_demand", count: quests.length } }).issues).toEqual([]);
  });

  it("picks a valid daily set: rustiest skill first, one standard at most, exploration toward the frontier", () => {
    const set = pickDailySet(ctx, "p1:2026-10-05");
    expect(set).toHaveLength(6);
    expect(validateBatch({ quests: set }, ctx).issues).toEqual([]);
    expect(set[0].skill_weights[0].skill).toBe("wealth");
    expect(set.filter(q => q.tier === "standard").length).toBeLessThanOrEqual(1);
    expect(set.at(-1)!.location).toEqual({ type: "district", ref: "871ec902effffff" });
  });

  it("is stable for a day and changes the next day", () => {
    const titles = (seed: string) => pickDailySet(ctx, seed).map(q => q.title);
    expect(titles("p1:2026-10-05")).toEqual(titles("p1:2026-10-05"));
    expect(titles("p1:2026-10-06")).not.toEqual(titles("p1:2026-10-05"));
  });

  it("respects constraints and recent quests", () => {
    const set = pickDailySet({ ...ctx, constraints: ["health limits physical activity, keep vitality quests gentle"],
      recentQuestTitles: ["Drink from the Morning Spring"] }, "s", 6);
    const physical = new Set(POOL.filter(p => p.tags?.includes("physical")).map(p => p.title));
    expect(set.some(q => physical.has(q.title))).toBe(false);
    expect(set.some(q => q.title === "Drink from the Morning Spring")).toBe(false);
  });
});

describe("dailyQuests", () => {
  const ai = (quests: Quest[]) => async () => ({ batch: { quests }, usage: { output_tokens: 1 } });

  it("uses the pool when there is no API key", async () => {
    const r = await dailyQuests(ctx, "s");
    expect(r.source).toBe("pool");
    expect(r.error).toBe("no_api_key");
    expect(r.quests).toHaveLength(6);
  });

  it("keeps a full generated set", async () => {
    const gen = pickDailySet(ctx, "other", 6).map(q => ({ ...q, rationale: "ai" }));
    const r = await dailyQuests(ctx, "s", ai(gen));
    expect(r.source).toBe("ai");
    expect(r.quests.every(q => q.rationale === "ai")).toBe(true);
  });

  it("tops up a short generated set from the pool without duplicates or id clashes", async () => {
    const gen = pickDailySet(ctx, "other", 2).map(q => ({ ...q, rationale: "ai" }));
    const r = await dailyQuests(ctx, "s", ai(gen));
    expect(r.source).toBe("mixed");
    expect(r.quests).toHaveLength(6);
    expect(new Set(r.quests.map(q => q.title)).size).toBe(6);
    expect(new Set(r.quests.map(q => q.local_id)).size).toBe(6);
  });

  it("falls back to the pool when the model call throws", async () => {
    const r = await dailyQuests(ctx, "s", async () => { throw new Error("overloaded"); });
    expect(r.source).toBe("pool");
    expect(r.error).toContain("overloaded");
  });
});

describe("daily-quests request", () => {
  const { playerId: _, ...context } = ctx;
  it("keeps the set the phone already shows when there is no model", async () => {
    const current = pickDailySet(ctx, "phone", 6);
    const r = await dailyQuests(ctx, "server-seed", undefined, current);
    expect(r.quests.map(q => q.title)).toEqual(current.map(q => q.title));
    expect(r.quests.map(q => q.local_id)).toEqual(current.map(q => q.local_id));
  });

  it("rejects an empty or malformed context instead of storing an empty day", async () => {
    const { DailyRequestSchema } = await import("../src/quests/daily.ts");
    expect(DailyRequestSchema.safeParse({ day: "2026-10-05", context: {} }).success).toBe(false);
    const wrongSkills = { ...context, skills: { VIT: { level: 1, form: 1 } } };
    expect(DailyRequestSchema.safeParse({ day: "2026-10-05", context: wrongSkills }).success).toBe(false);
    expect(DailyRequestSchema.safeParse({ day: "2026-10-05", context }).success).toBe(true);
  });
});
