// Life Quest — today's quests for one player: generate, validate, top up from the pool (pillar 3 flow).
// Runtime-agnostic: the Supabase edge function passes in the model call; tests pass a fake.
import { z } from "zod";
import {
  QuestSchema, validateBatch, type PlayerContext, type Quest, type QuestBatch, type ValidationIssue,
} from "./quest-generator.ts";
import { pickDailySet } from "./quest-pool.ts";

// ---------- Request contract (the app → the daily-quests function) ----------

const Skill = z.object({ level: z.number().int().min(1).max(500), form: z.number().min(0).max(1) });
const Mode = z.enum(["peaceful", "normal", "hard", "hardcore"]);

export const PlayerContextSchema = z.object({
  locale: z.string().max(20),
  localTime: z.string().max(40),
  difficulty: Mode,
  level: z.number().int().min(1).max(500),
  skills: z.object({ vitality: Skill, craft: Skill, wealth: Skill, charisma: Skill, mindset: Skill }).strict(),
  streakDays: z.number().int().min(0).max(100_000),
  constraints: z.array(z.string().max(120)).max(20),
  goals: z.array(z.object({ id: z.string().max(60), title: z.string().max(120), horizon: z.enum(["week", "month", "year"]) })).max(5),
  completionRate14d: z.record(z.string(), z.number().min(0).max(1)),
  targetEffort: z.number().min(0.5).max(2),
  recentQuestTitles: z.array(z.string().max(120)).max(100),
  waypoints: z.array(z.object({ id: z.string().max(60), kind: z.string().max(30), name: z.string().max(80) })).max(20),
  frontierDistricts: z.array(z.object({ id: z.string().regex(/^[0-9a-f]{15}$/), pctExplored: z.number(), distanceKm: z.number() })).max(10),
  request: z.object({ kind: z.literal("daily_set"), count: z.number().int().min(1).max(8), note: z.string().max(200).optional() }),
});

export const DailyRequestSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  context: PlayerContextSchema,
  /** The set the phone is already showing (from the on-device pool). Kept as the day's set when there's no AI,
   *  so the list never changes under the player's finger. */
  current: z.array(QuestSchema).max(8).optional(),
});

export interface DailyResult {
  quests: Quest[];
  source: "ai" | "pool" | "mixed";
  issues: ValidationIssue[];
  error?: string;               // why the model wasn't used, for quest_generations
  usage?: unknown;
}

/**
 * `generate` is absent when no API key is configured. Any failure (no key, refusal, network, too few valid
 * quests) ends in a full set from the pool: the player never sees an error.
 */
export async function dailyQuests(
  ctx: PlayerContext,
  seed: string,
  generate?: (ctx: PlayerContext) => Promise<{ batch: QuestBatch; usage: unknown }>,
  current?: Quest[],
): Promise<DailyResult> {
  const want = ctx.request.count;
  let kept: Quest[] = [];
  let issues: ValidationIssue[] = [];
  let usage: unknown;
  let error: string | undefined = generate ? undefined : "no_api_key";

  // No model: keep the set the phone already shows, if it is a valid set. Same quests, same ids, no swap.
  if (!generate && current?.length) {
    const r = validateBatch({ quests: current }, { ...ctx, recentQuestTitles: [] });
    if (r.quests.length === current.length && current.length >= Math.max(1, want - 1)) {
      return { quests: r.quests, source: "pool", issues: r.issues, error };
    }
  }

  if (generate) {
    try {
      const r = await generate(ctx);
      usage = r.usage;
      ({ quests: kept, issues } = validateBatch(r.batch, ctx));
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "unknown";
    }
  }
  // Spec: accept a set one short of the ask; anything less is topped up from the pool.
  if (kept.length >= Math.max(1, want - 1)) return { quests: kept, source: "ai", issues, usage };

  const fill = pickDailySet(ctx, seed, want - kept.length, {
    exclude: kept.map(q => q.title),
    idPrefix: kept.length ? "p" : "q",
  });
  return { quests: [...kept, ...fill], source: kept.length ? "mixed" : "pool", issues, error, usage };
}
