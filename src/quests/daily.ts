// Life Quest — today's quests for one player: generate, validate, top up from the pool (pillar 3 flow).
// Runtime-agnostic: the Supabase edge function passes in the model call; tests pass a fake.
import { validateBatch, type PlayerContext, type Quest, type QuestBatch, type ValidationIssue } from "./quest-generator.ts";
import { pickDailySet } from "./quest-pool.ts";

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
): Promise<DailyResult> {
  const want = ctx.request.count;
  let kept: Quest[] = [];
  let issues: ValidationIssue[] = [];
  let usage: unknown;
  let error: string | undefined = generate ? undefined : "no_api_key";

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
