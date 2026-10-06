import { describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import { validateBatch } from "../../src/quests/quest-generator";
import { DISTRICT_RES } from "../../src/spatial/spatial-engine";
import { frontierDistricts, playerContext, poolQuests } from "../src/game/context";
import { HOME, createSession } from "../src/game/mock-world";
import { SKIPPED, startGame } from "../src/game/onboarding";
import { restore, serialize } from "../src/game/persist";

const NOW = Date.UTC(2026, 9, 5, 7, 0);
const player = () => startGame(createSession(NOW), "Kaan", { ...SKIPPED, focusClass: "artisan" }, NOW).session;

describe("player context", () => {
  it("points the frontier at the six neighbouring districts, least explored first", () => {
    const f = frontierDistricts(createSession(NOW), 6);
    expect(f).toHaveLength(6);
    expect(f.map(d => d.id)).not.toContain(latLngToCell(HOME.lat, HOME.lng, DISTRICT_RES));
    expect(f[0].pctExplored).toBeLessThanOrEqual(f[5].pctExplored);
  });

  it("carries the calibration into the generator context", () => {
    const s = player();
    const ctx = playerContext(s, new Date(NOW));
    expect(ctx.difficulty).toBe(s.player.difficulty);
    expect(ctx.constraints).toEqual(s.player.profile!.constraints);
    expect(ctx.localTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("gives an offline daily set that passes the generator's validator", () => {
    const s = player();
    const quests = poolQuests(s, "2026-10-05").map(e => e.quest);
    const ctx = { ...playerContext(s, new Date(NOW)), recentQuestTitles: [], playerId: "local" };
    expect(validateBatch({ quests }, ctx).issues).toEqual([]);
  });

  it("rolls a saved player into a new pool set the next day", () => {
    const s = player();
    const back = restore(JSON.stringify(serialize(s, "2026-10-05")), "2026-10-06", () => createSession(NOW), poolQuests);
    expect(back.quests).toHaveLength(6);
    expect(back.quests.map(e => e.quest.title)).not.toEqual(s.quests.map(e => e.quest.title));
  });
});

describe("daily-quests request from the app", () => {
  it("passes the server's request schema", async () => {
    const { DailyRequestSchema } = await import("../../src/quests/daily");
    const s = player();
    const body = { day: "2026-10-05", context: { ...playerContext(s, new Date(NOW)), recentQuestTitles: [] }, current: s.quests.map(e => e.quest) };
    const r = DailyRequestSchema.safeParse(body);
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it("doesn't tag a skipped transport card as 'no vehicle'", () => {
    expect(player().player.profile!.constraints).toEqual([]);
  });
});
