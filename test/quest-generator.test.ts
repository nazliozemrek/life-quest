import { describe, expect, it } from "vitest";
import { nextTargetEffort, QuestBatchSchema, validateBatch, type PlayerContext, type Quest } from "../src/quests/quest-generator.ts";

const ctx: PlayerContext = {
  playerId: "p1", locale: "en-US", localTime: "2026-10-05T07:30:00+03:00", difficulty: "hard", level: 12,
  skills: {
    vitality: { level: 6, form: 1 }, craft: { level: 4, form: 0.6 }, wealth: { level: 2, form: 0.9 },
    charisma: { level: 3, form: 1 }, mindset: { level: 5, form: 0.5 },
  },
  streakDays: 9, constraints: ["night shifts"], goals: [{ id: "g1", title: "Run a 10K", horizon: "month" }],
  completionRate14d: { minor: 0.9 }, targetEffort: 1.1, recentQuestTitles: ["Walk the Moda coastline"],
  waypoints: [{ id: "wp_gym", kind: "gym", name: "Gym" }],
  frontierDistricts: [{ id: "871ec902effffff", pctExplored: 0.13, distanceKm: 1.2 }],
  request: { kind: "daily_set", count: 4 },
};

const q = (o: Partial<Quest>): Quest => ({
  local_id: "q", kind: "daily", title: "Iron Lungs", flavor_text: "The road calls.", objective: "Run 3 km",
  success: { type: "duration_minutes", target: 20, unit: "min" }, tier: "standard", effort: 1.1,
  skill_weights: [{ skill: "vitality", weight: 1 }], verification: "sensor", location: { type: "none", ref: null },
  window: { due_in_hours: 12, best_time: "evening" }, estimated_minutes: 25, prerequisites: [], chain: null,
  rationale: "10K goal", ...o,
});

describe("validateBatch", () => {
  const batch = QuestBatchSchema.parse({ quests: [
    q({ local_id: "q1" }),
    q({ local_id: "q2", title: "Gym Raid", success: { type: "geofence_dwell", target: 45, unit: "min" },
        location: { type: "waypoint", ref: "wp_gym" },
        skill_weights: [{ skill: "vitality", weight: 0.6 }, { skill: "mindset", weight: 0.6 }] }),
    q({ local_id: "q3", title: "Walk the Moda Coastline!", tier: "minor" }),
    q({ local_id: "q4", title: "Scout the frontier", kind: "exploration", location: { type: "waypoint", ref: "wp_fake" } }),
    q({ local_id: "q5", title: "Journal three lines", success: { type: "checkbox", target: null, unit: null },
        skill_weights: [{ skill: "mindset", weight: 1 }] }),
    q({ local_id: "q6", title: "Slay the dragon", tier: "boss" }),
  ] });
  const r = validateBatch(batch, ctx);

  it("keeps valid quests and fixes recoverable ones", () => {
    expect(r.quests.map(x => x.local_id)).toEqual(["q1", "q2", "q5"]);
    expect(r.quests[1].skill_weights.map(w => w.weight)).toEqual([0.5, 0.5]);
    expect(r.quests[2].verification).toBe("self");
  });
  it("drops duplicates, invented places and out-of-scope tiers", () => {
    const fatal = Object.fromEntries(r.issues.filter(i => i.fatal).map(i => [i.localId, i.issue]));
    expect(fatal).toEqual({
      q3: "duplicate of a recent quest",
      q4: "unknown waypoint",
      q6: "epic/boss outside main_chain",
    });
  });
});

describe("schema", () => {
  it("enforces numeric bounds client-side", () => {
    expect(() => QuestBatchSchema.parse({ quests: [q({ effort: 3 })] })).toThrow();
  });
});

describe("adaptive effort", () => {
  it("steers toward 70% completion within bounds", () => {
    expect(nextTargetEffort(1.0, 1.0)).toBe(1.15);
    expect(nextTargetEffort(1.0, 0.4)).toBe(0.85);
    expect(nextTargetEffort(0.55, 0.1)).toBe(0.5);
  });
});
