// Life Quest — AI quest generator (pillar 3).
// The LLM designs quests; it never prices them. XP is computed server-side by xp-engine.ts (pillar 1).
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const PROMPT_VERSION = "qg-2026-10-05.1";
export const MODEL = "claude-opus-5-5";

// ---------- Contract ----------
// min/max/length constraints are stripped from the schema sent to the API and enforced client-side by the SDK.

const SkillCode = z.enum(["vitality", "craft", "wealth", "charisma", "mindset"]);

export const QuestSchema = z.object({
  local_id: z.string().describe("Unique within this batch, e.g. q1. Used for prerequisites."),
  kind: z.enum(["daily", "side", "main_step", "exploration", "boss"]),
  title: z.string().min(3).max(60).describe("Imperative, game-flavored, under 60 chars"),
  flavor_text: z.string().max(240).describe("One or two sentences of RPG narration"),
  objective: z.string().max(200).describe("The plain real-world action, unambiguous"),
  success: z.object({
    type: z.enum(["checkbox", "count", "duration_minutes", "geofence_dwell", "photo", "peer_confirm"]),
    target: z.number().nullable().describe("Count or minutes; null for checkbox/photo/peer_confirm"),
    unit: z.string().nullable(),
  }),
  tier: z.enum(["trivial", "minor", "standard", "major", "epic", "boss"]),
  effort: z.number().min(0.5).max(2).describe("Effort relative to tier for THIS player, 1.0 = typical"),
  skill_weights: z.array(z.object({ skill: SkillCode, weight: z.number().min(0).max(1) })).min(1).max(3),
  verification: z.enum(["self", "evidence", "sensor"]),
  location: z.object({
    type: z.enum(["none", "waypoint", "district"]),
    ref: z.string().nullable().describe("Waypoint id or district id from the context; never invent one"),
  }),
  window: z.object({
    due_in_hours: z.number().int().min(1).max(24 * 30),
    best_time: z.enum(["any", "morning", "midday", "evening", "weekend"]),
  }),
  estimated_minutes: z.number().int().min(1).max(600),
  prerequisites: z.array(z.string()).describe("local_ids that must be completed first"),
  chain: z.object({ main_quest_id: z.string(), step: z.number().int(), of: z.number().int() }).nullable(),
  rationale: z.string().max(300).describe("Why this quest for this player now. Logged, never shown."),
});

export const QuestBatchSchema = z.object({ quests: z.array(QuestSchema).min(1).max(8) });
export type Quest = z.infer<typeof QuestSchema>;
export type QuestBatch = z.infer<typeof QuestBatchSchema>;

// ---------- Context ----------

export interface PlayerContext {
  playerId: string;
  locale: string;                       // "tr-TR", "en-US"
  localTime: string;                    // ISO with offset
  difficulty: "peaceful" | "normal" | "hard" | "hardcore";
  level: number;
  skills: Record<z.infer<typeof SkillCode>, { level: number; form: number }>;
  streakDays: number;
  constraints: string[];                // from onboarding: "night shifts", "knee injury", "no car", "budget tight"
  goals: { id: string; title: string; horizon: "week" | "month" | "year" }[];
  completionRate14d: Record<string, number>; // per tier
  targetEffort: number;                 // from the adaptive controller, 0.5..2.0
  recentQuestTitles: string[];          // last 14 days, for dedupe
  waypoints: { id: string; kind: string; name: string }[]; // private names are fine; never coordinates
  frontierDistricts: { id: string; pctExplored: number; distanceKm: number }[];
  request: { kind: "daily_set" | "on_demand" | "main_chain"; count: number; note?: string };
}

// ---------- Prompt (frozen, cached) ----------

export const SYSTEM_PROMPT = `You are the Quest Master for Life Quest, a mobile RPG layered over the player's real life.
You design quests that are real, achievable actions in the player's life, framed with light RPG flavor.

How to design:
- Ground every quest in the player's context: their goals, constraints, skill Form, time of day and available waypoints.
- Calibrate effort to targetEffort. Players in Hard or Hardcore mode have harder lives, not more free time: respect constraints over ambition.
- Prefer skills with low Form when a goal allows it; a returning player should get a quick win first.
- Mix tiers. A daily set is mostly trivial/minor/standard with at most one major. Never produce epic or boss tiers unless request.kind is main_chain.
- Main chains break a goal into ordered steps using prerequisites and chain.step/of. Each step must be completable in one session.
- Use location only with an id present in the context (waypoints or frontierDistricts). Exploration quests target a frontier district.
- Choose verification honestly: "sensor" only for geofence_dwell or duration tracked by the phone, "evidence" for photo/peer_confirm, otherwise "self".
- skill_weights must sum to 1 across at most 3 skills.
- Do not repeat or lightly reword anything in recentQuestTitles.
- Write title, flavor_text and objective in the player's locale.

Never:
- Assign XP, rewards, or numbers about the economy; the game engine prices quests.
- Suggest medical, legal, or investment actions beyond everyday habits (e.g. "walk 20 minutes" is fine, "stop your medication" or "buy this stock" is not).
- Suggest anything dangerous, illegal, involving trespass, or that requires contacting strangers alone at night.
- Use guilt or shame. Missed quests are normal.`;

// ---------- Client ----------

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic());

/** Real-time generation (on-demand quest, onboarding first set). */
export async function generateQuests(ctx: PlayerContext): Promise<{ batch: QuestBatch; usage: unknown }> {
  const res = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(QuestBatchSchema) },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: renderContext(ctx) }],
  });
  if (res.stop_reason === "refusal") throw new QuestGenError("refusal", res.stop_details);
  if (res.stop_reason === "max_tokens") throw new QuestGenError("truncated");
  if (!res.parsed_output) throw new QuestGenError("unparsed");
  return { batch: res.parsed_output, usage: res.usage };
}

/** Nightly daily sets for every active player: Batches API, 50% cost. Fallbacks are not allowed on batches. */
export async function submitNightlyBatch(contexts: PlayerContext[]) {
  return client().messages.batches.create({
    requests: contexts.map(ctx => ({
      custom_id: `daily:${ctx.playerId}:${ctx.localTime.slice(0, 10)}`,
      params: {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium", format: zodOutputFormat(QuestBatchSchema) },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: renderContext(ctx) }],
      },
    })),
  });
}

/** Parse one batch result's text. Results arrive in any order: key by custom_id. */
export function parseBatchText(text: string): QuestBatch {
  return QuestBatchSchema.parse(JSON.parse(text));
}

/** Volatile per-player context goes last so the system prompt stays a stable cached prefix. */
export function renderContext(ctx: PlayerContext): string {
  return `<player_context>\n${JSON.stringify(ctx, null, 1)}\n</player_context>\n` +
    `Design ${ctx.request.count} quest(s) for request.kind = "${ctx.request.kind}".`;
}

export class QuestGenError extends Error {
  readonly code: "refusal" | "truncated" | "unparsed" | "invalid";
  readonly detail?: unknown;
  constructor(code: QuestGenError["code"], detail?: unknown) {
    super(`quest generation failed: ${code}`);
    this.code = code;
    this.detail = detail;
  }
}

// ---------- Semantic validation (what a schema can't express) ----------

export interface ValidationIssue { localId: string; issue: string; fatal: boolean }

export function validateBatch(batch: QuestBatch, ctx: PlayerContext): { quests: Quest[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const ids = new Set(batch.quests.map(q => q.local_id));
  const waypointIds = new Set(ctx.waypoints.map(w => w.id));
  const districtIds = new Set(ctx.frontierDistricts.map(d => d.id));
  const recent = new Set(ctx.recentQuestTitles.map(normalizeTitle));
  const out: Quest[] = [];
  let majors = 0;

  for (const q of batch.quests) {
    const bad = (issue: string, fatal = true) => issues.push({ localId: q.local_id, issue, fatal });

    // Weights: renormalize small drift, reject garbage.
    const sum = q.skill_weights.reduce((s, w) => s + w.weight, 0);
    if (sum <= 0) { bad("skill_weights sum to 0"); continue; }
    if (Math.abs(sum - 1) > 0.05) bad(`skill_weights summed to ${sum.toFixed(2)}, renormalized`, false);
    const skillWeights = q.skill_weights.map(w => ({ ...w, weight: w.weight / sum }));

    if (q.location.type === "waypoint" && !waypointIds.has(q.location.ref ?? "")) { bad("unknown waypoint"); continue; }
    if (q.location.type === "district" && !districtIds.has(q.location.ref ?? "")) { bad("unknown district"); continue; }
    if (q.success.type === "geofence_dwell" && q.location.type === "none") { bad("geofence_dwell without location"); continue; }
    if (q.verification === "sensor" && !["geofence_dwell", "duration_minutes"].includes(q.success.type)) {
      bad("sensor verification on a non-sensor objective, downgraded to self", false);
      q.verification = "self";
    }
    if (recent.has(normalizeTitle(q.title))) { bad("duplicate of a recent quest"); continue; }
    if ((q.tier === "epic" || q.tier === "boss") && ctx.request.kind !== "main_chain") { bad("epic/boss outside main_chain"); continue; }
    if (q.tier === "major" && ctx.request.kind === "daily_set" && ++majors > 1) { bad("more than one major in a daily set"); continue; }
    if (q.prerequisites.some(p => !ids.has(p) || p === q.local_id)) { bad("dangling prerequisite"); continue; }

    out.push({ ...q, skill_weights: skillWeights });
  }
  return { quests: out, issues };
}

export function normalizeTitle(t: string): string {
  return t.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
}

// ---------- Adaptive difficulty ----------

/** Proportional controller toward a 70% completion rate. Run nightly per player. */
export function nextTargetEffort(current: number, completionRate14d: number, target = 0.7): number {
  const step = 0.5 * (completionRate14d - target);       // 100% done -> +0.15, 40% done -> -0.15
  return Math.min(2, Math.max(0.5, +(current + step).toFixed(2)));
}
