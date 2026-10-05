// POST /functions/v1/daily-quests  { day: "2026-10-05", context: PlayerContext without playerId }
// Returns today's quest set for the signed-in player, creating it once per day:
// AI-generated when ANTHROPIC_API_KEY is set as a function secret, otherwise (or on any failure) from the pool.
// The same day always returns the stored set, so a reinstall or second device sees the same quests.
import { createClient } from "@supabase/supabase-js";
import { DailyRequestSchema, dailyQuests } from "../../../src/quests/daily.ts";
import { generateQuests, MODEL, PROMPT_VERSION, type PlayerContext } from "../../../src/quests/quest-generator.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Act as the caller, so every read and write below goes through their Row Level Security.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const parsed = DailyRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "bad_request", issues: parsed.error.issues.slice(0, 5) }, 400);
  const { day, context, current } = parsed.data;

  const stored = await supabase.from("daily_quest_sets").select("quests").eq("day", day).maybeSingle();
  if (stored.data) return json({ day, quests: stored.data.quests, source: "stored" });

  const ctx: PlayerContext = { ...context, playerId: user.id };
  const hasKey = !!Deno.env.get("ANTHROPIC_API_KEY");
  const r = await dailyQuests(ctx, `${user.id}:${day}`, hasKey ? generateQuests : undefined, current);
  // A day with no quests would stick for 24 hours: never store one.
  if (!r.quests.length) return json({ error: "no_quests" }, 500);

  const gen = await supabase.from("quest_generations").insert({
    day, source: r.source, prompt_version: PROMPT_VERSION, model: r.source === "pool" ? null : MODEL,
    issues: r.issues, error: r.error ?? null, usage: r.usage ?? null,
  }).select("id").single();

  // Two devices racing on the same morning: the first insert wins and both return it.
  await supabase.from("daily_quest_sets").upsert(
    { day, quests: r.quests, generation_id: gen.data?.id ?? null },
    { onConflict: "player_id,day", ignoreDuplicates: true },
  );
  const final = await supabase.from("daily_quest_sets").select("quests").eq("day", day).single();
  if (final.error) return json({ day, quests: r.quests, source: r.source });   // still give the player quests
  return json({ day, quests: final.data.quests, source: r.source });
});
