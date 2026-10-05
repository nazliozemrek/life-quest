// Offline-first sync. The game never waits on the network: every change that the server should know about is
// queued here (and saved with the game), then flushed in order whenever the player is signed in and online.
// Every write is idempotent (ledger keys, upserts), so a flush that dies halfway is simply retried.
import type { AwardResult } from "../../../src/xp/xp-engine";
import { CURVE_VERSION } from "../../../src/xp/xp-engine";
import { districtOf } from "../../../src/spatial/spatial-engine";
import type { Calibration } from "../game/onboarding";
import type { Player } from "../game/session";

export type SyncOp =
  | { op: "profile"; player: Pick<Player, "name" | "difficulty"> & { profile: NonNullable<Player["profile"]> } }
  | { op: "xp"; key: string; source: "quest" | "backstory" | "creation"; title: string | null; xp: number;
      split: Record<string, number>; rested: number; multipliers: Record<string, number> };

export function profileOp(p: Player): SyncOp | null {
  return p.profile ? { op: "profile", player: { name: p.name, difficulty: p.difficulty, profile: p.profile } } : null;
}

export function questOp(day: string, localId: string, title: string, award: AwardResult): SyncOp {
  return {
    op: "xp", key: `quest:${day}:${localId}`, source: "quest", title, xp: award.totalXp,
    split: award.perSkill as Record<string, number>, rested: award.restedConsumed, multipliers: award.multipliers,
  };
}

/** Starting XP from character creation, as two ledger rows: backstory (per skill) and the tutorial quest. */
export function creationOps(c: Calibration, creationXp: number): SyncOp[] {
  return [
    { op: "xp", key: "backstory", source: "backstory", title: "Backstory", xp: c.backstory.total,
      split: c.backstory.perSkill, rested: 0, multipliers: {} },
    { op: "xp", key: "creation", source: "creation", title: "Complete character creation", xp: creationXp,
      split: {}, rested: 0, multipliers: {} },
  ];
}

/** The slice of the Supabase client the flush uses, so tests can pass a recorder. */
export interface Db {
  from(table: string): {
    upsert(rows: object | object[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): PromiseLike<{ error: unknown }>;
    insert(rows: object | object[]): PromiseLike<{ error: unknown }>;
  };
}

const CELL_CHUNK = 500;

/**
 * Send queued ops in order, then any explored cells the server hasn't seen. Stops at the first failure and
 * returns what's left, so order is kept (the player row must exist before ledger rows reference it).
 */
export async function flush(
  db: Db, ops: SyncOp[], explored: ReadonlySet<string>, synced: ReadonlySet<string>,
): Promise<{ remaining: SyncOp[]; synced: Set<string> }> {
  const done = new Set(synced);
  let i = 0;
  for (; i < ops.length; i++) {
    const o = ops[i];
    const { error } = o.op === "profile" ? await sendProfile(db, o) : await db.from("xp_ledger").upsert({
      idempotency_key: o.key, source: o.source, title: o.title, final_xp: o.xp, skill_split: o.split,
      rested_consumed: o.rested, multipliers: o.multipliers, curve_version: CURVE_VERSION,
    }, { onConflict: "player_id,idempotency_key", ignoreDuplicates: true });
    if (error) return { remaining: ops.slice(i), synced: done };
  }
  // Cells only once the player row exists, i.e. nothing is stuck in the queue.
  const pending = [...explored].filter(c => !done.has(c));
  for (let k = 0; k < pending.length; k += CELL_CHUNK) {
    const chunk = pending.slice(k, k + CELL_CHUNK);
    const { error } = await db.from("player_explored_cells").upsert(
      chunk.map(cell => ({ cell, district: districtOf(cell) })),
      { onConflict: "player_id,cell", ignoreDuplicates: true },
    );
    if (error) break;
    chunk.forEach(c => done.add(c));
  }
  return { remaining: [], synced: done };
}

async function sendProfile(db: Db, o: Extract<SyncOp, { op: "profile" }>): Promise<{ error: unknown }> {
  const pr = o.player.profile;
  const player = await db.from("players").upsert({
    handle: o.player.name, class: pr.className, difficulty: o.player.difficulty, rules_mode: pr.rulesMode,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  }, { onConflict: "id" });
  if (player.error) return player;
  // Derived values only; the raw answers stay on the phone.
  return db.from("calibrations").insert({
    version: pr.calibrationVersion, trigger: "onboarding", life_load: pr.lifeLoad, calibrated_mode: pr.calibratedMode,
    rules_mode: pr.rulesMode, xp_mode: o.player.difficulty, constraint_tags: pr.constraints, target_effort: pr.targetEffort,
  });
}
