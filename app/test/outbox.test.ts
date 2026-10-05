import { describe, expect, it } from "vitest";
import { calibrate } from "../../src/onboarding/calibration";
import { createSession } from "../src/game/mock-world";
import { SKIPPED, startGame } from "../src/game/onboarding";
import { completeQuest } from "../src/game/session";
import { creationOps, flush, goalsOp, profileOp, questOp, type Db } from "../src/net/outbox";

const NOW = Date.UTC(2026, 9, 5, 7, 0);

/** Records every write; fails the named table's next call when asked. */
function recorder(failOn?: string) {
  const calls: { table: string; kind: string; rows: any }[] = [];
  let fail = failOn;
  const db: Db = {
    from: table => ({
      upsert: async rows => { calls.push({ table, kind: "upsert", rows }); if (fail === table) { fail = undefined; return { error: "down" }; } return { error: null }; },
      insert: async rows => { calls.push({ table, kind: "insert", rows }); if (fail === table) { fail = undefined; return { error: "down" }; } return { error: null }; },
      delete: () => ({ like: async (column, pattern) => { calls.push({ table, kind: "delete", rows: { column, pattern } }); return { error: null }; } }),
    }),
  };
  return { db, calls };
}

function playedSession() {
  const answers = { ...SKIPPED, achievements: ["degree" as const], focusClass: "artisan" as const };
  const s = startGame(createSession(NOW), "Kaan", answers, NOW).session;
  const q = s.quests.find(e => e.quest.location.type === "none")!.quest;
  const r = completeQuest(s, q.local_id);
  if (!r.ok) throw new Error(r.reason);
  return { s: r.session, answers, award: r.award, q };
}

describe("sync outbox", () => {
  it("sends profile, starting XP and a quest in order, then the explored map", async () => {
    const { s, answers, award, q } = playedSession();
    const ops = [profileOp(s.player)!, ...creationOps(calibrate(answers), 100), questOp("2026-10-05", q.local_id, q.title, award)];
    const { db, calls } = recorder();
    const r = await flush(db, ops, s.explored, new Set());

    expect(r.remaining).toEqual([]);
    expect(calls.map(c => c.table)).toEqual(["players", "calibrations", "xp_ledger", "xp_ledger", "xp_ledger", "player_explored_cells"]);
    expect(calls[1].rows).not.toHaveProperty("answers");                       // raw answers never leave the phone
    expect(calls[4].rows).toMatchObject({ idempotency_key: `quest:2026-10-05:${q.local_id}`, final_xp: award.totalXp });
    expect(calls[5].rows).toHaveLength(s.explored.size);
    expect(r.synced.size).toBe(s.explored.size);
  });

  it("stops at a failure and keeps the rest queued in order", async () => {
    const { s, answers } = playedSession();
    const ops = [profileOp(s.player)!, ...creationOps(calibrate(answers), 100)];
    const { db, calls } = recorder("xp_ledger");
    const r = await flush(db, ops, s.explored, new Set());
    expect(r.remaining).toEqual(ops.slice(1));
    expect(calls.some(c => c.table === "player_explored_cells")).toBe(false);
  });

  it("only sends cells the server hasn't seen", async () => {
    const { s } = playedSession();
    const seen = new Set([...s.explored].slice(0, 5));
    const { db, calls } = recorder();
    await flush(db, [], s.explored, seen);
    expect(calls[0].rows).toHaveLength(s.explored.size - 5);
  });

  it("replaces the goal list: delete, then insert", async () => {
    const goals = [{ id: "g1", title: "Run a 5K", horizon: "month" as const, skill: "vitality" as const }];
    const { db, calls } = recorder();
    const r = await flush(db, [goalsOp(goals), goalsOp([])], new Set(), new Set());
    expect(r.remaining).toEqual([]);
    expect(calls.map(c => `${c.kind}:${c.table}`)).toEqual(["delete:player_goals", "insert:player_goals", "delete:player_goals"]);
    expect(calls[1].rows).toEqual(goals);
  });
});
