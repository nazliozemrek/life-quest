// Life Quest — curated quest pool (pillar 3 fallback).
// Hand-written quests in the generator's own contract. Used when there is no API key, the model call fails,
// or too few generated quests survive validateBatch. "Degrade, don't fail": the player always gets a daily set.
import type { PlayerContext, Quest } from "./quest-generator.ts";

type Skill = Quest["skill_weights"][number]["skill"];
type Tag = "physical" | "intense" | "costs_money" | "outdoors" | "social";

export interface PoolQuest {
  id: string;
  skill: Skill;
  second?: Skill;                       // optional 30% secondary skill
  tier: "trivial" | "minor" | "standard";
  title: string;
  flavor: string;
  objective: string;
  success: Quest["success"];
  minutes: number;
  bestTime: Quest["window"]["best_time"];
  tags?: Tag[];
  place?: "home" | "work" | "gym";      // only offered when the player has pinned this place; points at wp_<place>
}

const check = { type: "checkbox", target: null, unit: null } as const;
const mins = (n: number) => ({ type: "duration_minutes", target: n, unit: "min" }) as const;
const count = (n: number, unit: string) => ({ type: "count", target: n, unit }) as const;

export const POOL: PoolQuest[] = [
  // Vitality
  { id: "vit.water", skill: "vitality", tier: "trivial", title: "Drink from the Morning Spring", flavor: "Every adventure starts hydrated.",
    objective: "Drink a full glass of water within an hour of waking up.", success: check, minutes: 1, bestTime: "morning" },
  { id: "vit.walk20", skill: "vitality", tier: "minor", title: "Walk the Long Road", flavor: "The map only grows under your feet.",
    objective: "Go for a 20-minute walk.", success: mins(20), minutes: 20, bestTime: "any", tags: ["physical", "outdoors"] },
  { id: "vit.stretch", skill: "vitality", tier: "trivial", title: "Loosen the Armor", flavor: "Stiff joints lose duels.",
    objective: "Stretch for 5 minutes.", success: mins(5), minutes: 5, bestTime: "any", tags: ["physical"] },
  { id: "vit.stairs", skill: "vitality", tier: "minor", title: "Climb the Tower Stairs", flavor: "The lift is for merchants.",
    objective: "Take the stairs instead of the lift every time today.", success: check, minutes: 5, bestTime: "any", tags: ["physical"] },
  { id: "vit.workout", skill: "vitality", tier: "standard", title: "Train Until the Sword Feels Light", flavor: "Strength is built, not found.",
    objective: "Do a 30-minute workout: run, gym, home circuit or sport.", success: mins(30), minutes: 30, bestTime: "any", tags: ["physical", "intense"] },
  { id: "vit.sleep", skill: "vitality", second: "mindset", tier: "minor", title: "Bank the Campfire Early", flavor: "Rest is a stat too.",
    objective: "Put your phone away 30 minutes before bed tonight.", success: check, minutes: 30, bestTime: "evening" },
  { id: "vit.veg", skill: "vitality", tier: "trivial", title: "Forage Something Green", flavor: "Rations matter.",
    objective: "Eat a portion of vegetables or fruit with one meal.", success: check, minutes: 5, bestTime: "midday" },

  { id: "vit.gym45", skill: "vitality", tier: "standard", place: "gym", title: "Raid Your Gym", flavor: "The iron remembers who shows up.",
    objective: "Train at your gym for 45 minutes.", success: { type: "geofence_dwell", target: 45, unit: "min" }, minutes: 50,
    bestTime: "any", tags: ["physical", "intense"] },
  { id: "vit.gym20", skill: "vitality", tier: "minor", place: "gym", title: "Quick Strike at the Gym", flavor: "Twenty minutes still counts.",
    objective: "Get to your gym and train for at least 20 minutes.", success: { type: "geofence_dwell", target: 20, unit: "min" },
    minutes: 25, bestTime: "any", tags: ["physical"] },

  // Craft
  { id: "crf.focus25", skill: "craft", second: "mindset", tier: "standard", title: "Forge 25 Minutes of Deep Work", flavor: "The anvil rewards the patient.",
    objective: "Work on your main project for 25 minutes with notifications off.", success: mins(25), minutes: 25, bestTime: "morning" },
  { id: "crf.learn15", skill: "craft", tier: "minor", title: "Study the Old Scrolls", flavor: "Every master was once an apprentice.",
    objective: "Spend 15 minutes learning a skill: a course, a tutorial or a book chapter.", success: mins(15), minutes: 15, bestTime: "any" },
  { id: "crf.fix", skill: "craft", tier: "minor", title: "Mend One Broken Thing", flavor: "Small repairs keep the keep standing.",
    objective: "Fix, sew, clean up or finish one small thing you've been putting off.", success: check, minutes: 20, bestTime: "weekend" },
  { id: "crf.make", skill: "craft", tier: "standard", title: "Make Something With Your Hands", flavor: "Ideas are cheap; artifacts are not.",
    objective: "Spend 30 minutes making something: draw, cook a new dish, build, write or code.", success: mins(30), minutes: 30, bestTime: "evening" },
  { id: "crf.ship", skill: "craft", tier: "minor", title: "Show the Guild Your Work", flavor: "A blade in a drawer cuts nothing.",
    objective: "Share one thing you made with someone and ask for feedback.", success: check, minutes: 10, bestTime: "any", tags: ["social"] },
  { id: "crf.workfirst", skill: "craft", second: "wealth", tier: "minor", place: "work", title: "Strike First at the Guild Hall",
    flavor: "The hardest task falls easiest before the noise starts.",
    objective: "At work, do your hardest task for 30 minutes before opening messages.", success: check, minutes: 30, bestTime: "morning" },
  { id: "crf.desk", skill: "craft", tier: "trivial", title: "Clear the Workbench", flavor: "A clean bench is a fast bench.",
    objective: "Tidy your desk or workspace for 5 minutes.", success: mins(5), minutes: 5, bestTime: "any" },

  // Wealth
  { id: "wlt.audit", skill: "wealth", tier: "minor", title: "Audit the Coin Purse", flavor: "A wise merchant knows where every coin sleeps.",
    objective: "List every subscription you pay for and what each costs per month.", success: check, minutes: 15, bestTime: "evening" },
  { id: "wlt.track", skill: "wealth", tier: "trivial", title: "Ink Today's Ledger", flavor: "Gold counted is gold kept.",
    objective: "Write down everything you spent today.", success: check, minutes: 5, bestTime: "evening" },
  { id: "wlt.nospend", skill: "wealth", tier: "minor", title: "Keep the Purse Closed", flavor: "Some days the treasury rests.",
    objective: "Spend nothing beyond essentials today.", success: check, minutes: 1, bestTime: "any" },
  { id: "wlt.save", skill: "wealth", tier: "minor", title: "Fill the War Chest", flavor: "Future you is the one who wins the siege.",
    objective: "Move any amount, even a small one, into savings.", success: check, minutes: 5, bestTime: "any" },
  { id: "wlt.career", skill: "wealth", second: "craft", tier: "standard", title: "Sharpen Your Trade Papers", flavor: "Opportunity favors the prepared.",
    objective: "Spend 25 minutes improving your CV, portfolio or a work proposal.", success: mins(25), minutes: 25, bestTime: "any" },
  { id: "wlt.price", skill: "wealth", tier: "trivial", title: "Haggle With Yourself", flavor: "Every purchase has a rival.",
    objective: "Before one purchase today, compare at least two prices.", success: check, minutes: 5, bestTime: "any" },

  // Charisma
  { id: "cha.message", skill: "charisma", tier: "trivial", title: "Send a Raven to an Old Ally", flavor: "Alliances fade without word.",
    objective: "Message a friend you haven't talked to in a while.", success: check, minutes: 5, bestTime: "any", tags: ["social"] },
  { id: "cha.call", skill: "charisma", tier: "minor", title: "Speak by the Fireside", flavor: "Voices carry what texts can't.",
    objective: "Call a family member or friend and talk for at least 10 minutes.", success: mins(10), minutes: 10, bestTime: "evening", tags: ["social"] },
  { id: "cha.compliment", skill: "charisma", tier: "trivial", title: "Grant a Boon", flavor: "Kind words cost nothing and buy much.",
    objective: "Give someone a genuine, specific compliment.", success: check, minutes: 1, bestTime: "any", tags: ["social"] },
  { id: "cha.meet", skill: "charisma", tier: "standard", title: "Gather the Party", flavor: "No hero wins alone.",
    objective: "Meet a friend in person for coffee, a walk or a meal.", success: check, minutes: 60, bestTime: "weekend", tags: ["social", "outdoors", "costs_money"] },
  { id: "cha.listen", skill: "charisma", second: "mindset", tier: "minor", title: "Hear the Bard's Tale", flavor: "The best talkers listen first.",
    objective: "In one conversation today, ask three questions before sharing your own story.", success: check, minutes: 10, bestTime: "any", tags: ["social"] },
  { id: "cha.thanks", skill: "charisma", tier: "trivial", title: "Pay Tribute", flavor: "Gratitude is a currency.",
    objective: "Thank someone for something specific they did for you.", success: check, minutes: 2, bestTime: "any", tags: ["social"] },

  // Mindset
  { id: "mnd.journal", skill: "mindset", tier: "trivial", title: "Write Three Lines in the Chronicle", flavor: "The story is yours to record.",
    objective: "Write three lines about your day.", success: check, minutes: 5, bestTime: "evening" },
  { id: "mnd.breathe", skill: "mindset", tier: "trivial", title: "Still the Inner Storm", flavor: "Calm is a weapon.",
    objective: "Do 5 minutes of slow breathing or meditation.", success: mins(5), minutes: 5, bestTime: "any" },
  { id: "mnd.read", skill: "mindset", tier: "minor", title: "Read by Candlelight", flavor: "Every page is a map.",
    objective: "Read a book for 20 minutes.", success: mins(20), minutes: 20, bestTime: "evening" },
  { id: "mnd.plan", skill: "mindset", second: "craft", tier: "minor", title: "Plot Tomorrow's Campaign", flavor: "Battles are won the night before.",
    objective: "Write tomorrow's top three priorities.", success: check, minutes: 10, bestTime: "evening" },
  { id: "mnd.offline", skill: "mindset", tier: "standard", title: "Walk the Silent Hour", flavor: "The feed will wait.",
    objective: "Spend one hour with no social media or news.", success: mins(60), minutes: 60, bestTime: "any" },
  { id: "mnd.gratitude", skill: "mindset", tier: "trivial", title: "Count the Spoils", flavor: "Even small loot is loot.",
    objective: "Write down three things that went well today.", success: count(3, "things"), minutes: 3, bestTime: "evening" },
];

/** Exploration is generated per player: it points at a real frontier district from their map. */
function explorationQuest(districtId: string, effort: number): Quest {
  return {
    local_id: "", kind: "exploration", title: "Scout the Uncharted Streets",
    flavor_text: "Beyond the fog lies a district no one has mapped. Yet.",
    objective: "Walk through the nearest unexplored district and reveal 15 new cells.",
    success: { type: "count", target: 15, unit: "cells" },
    tier: "minor", effort, skill_weights: [{ skill: "vitality", weight: 0.6 }, { skill: "mindset", weight: 0.4 }],
    verification: "self", location: { type: "district", ref: districtId },  // the fog gate proves it; "sensor" is reserved for dwell and timers
    window: { due_in_hours: 24, best_time: "any" }, estimated_minutes: 30, prerequisites: [], chain: null,
    rationale: "pool: exploration toward the nearest frontier district",
  };
}

/** Constraint tags from pillar 4 calibration that rule pool quests out. */
function excluded(p: PoolQuest, constraints: string[]): boolean {
  const has = (s: string) => constraints.some(c => c.includes(s));
  const tags = p.tags ?? [];
  if (has("health limits physical activity") && tags.includes("physical")) return true;
  if (has("some physical limitations") && tags.includes("intense")) return true;
  if (has("tight budget") && tags.includes("costs_money")) return true;
  if (has("hard period") && tags.includes("intense")) return true;
  return false;
}

/** Small deterministic PRNG so a player's pool set is stable for the day (reopening the app doesn't reshuffle). */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function toQuest(p: PoolQuest, localId: string, effort: number): Quest {
  return {
    local_id: localId, kind: "daily", title: p.title, flavor_text: p.flavor, objective: p.objective, success: p.success,
    tier: p.tier, effort,
    skill_weights: p.second ? [{ skill: p.skill, weight: 0.7 }, { skill: p.second, weight: 0.3 }] : [{ skill: p.skill, weight: 1 }],
    verification: p.success.type === "duration_minutes" || p.success.type === "geofence_dwell" ? "sensor" : "self",
    location: p.place ? { type: "waypoint", ref: `wp_${p.place}` } : { type: "none", ref: null },
    window: { due_in_hours: 24, best_time: p.bestTime }, estimated_minutes: p.minutes, prerequisites: [], chain: null,
    rationale: `pool:${p.id}`,
  };
}

/**
 * A daily set from the pool: one quest per skill, rustiest skills first (a comeback win), then an exploration quest
 * when the player has a frontier. At most one standard-tier quest, like a generated set.
 */
export function pickDailySet(
  ctx: Pick<PlayerContext, "skills" | "constraints" | "recentQuestTitles" | "frontierDistricts" | "targetEffort" | "waypoints">,
  seed: string,
  count = 6,
  opts: { exclude?: string[]; idPrefix?: string; focusSkills?: Skill[] } = {},
): Quest[] {
  const rand = rng(seed);
  const norm = (t: string) => t.toLocaleLowerCase().trim();
  const taken = new Set([...ctx.recentQuestTitles, ...(opts.exclude ?? [])].map(norm));
  const effort = Math.min(2, Math.max(0.5, ctx.targetEffort));
  const out: Quest[] = [];
  const id = () => `${opts.idPrefix ?? "q"}${out.length + 1}`;

  const frontier = ctx.frontierDistricts[0];
  const slots = frontier && !taken.has(norm("Scout the Uncharted Streets")) ? count - 1 : count;

  const places = new Set(ctx.waypoints.map(w => w.id));
  const candidates = POOL.filter(p => !excluded(p, ctx.constraints) && !taken.has(norm(p.title)))
    .filter(p => !p.place || places.has(`wp_${p.place}`))
    // Quests at the player's own places are what make the map theirs: they usually win their skill's slot.
    .map(p => ({ p, r: rand() - (p.place ? 0.5 : 0) }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.p);

  // Skills behind the player's goals first, then the rustiest.
  const focus = new Set(opts.focusSkills ?? []);
  const skills = (Object.keys(ctx.skills) as Skill[])
    .sort((a, b) => Number(focus.has(b)) - Number(focus.has(a)) || ctx.skills[a].form - ctx.skills[b].form);
  let standards = 0;
  const take = (p: PoolQuest) => {
    if (p.tier === "standard" && standards >= 1) return false;
    if (p.tier === "standard") standards++;
    out.push(toQuest(p, id(), effort));
    candidates.splice(candidates.indexOf(p), 1);
    return true;
  };
  // Round-robin over skills, rustiest first, until the slots are full or the pool runs dry.
  for (let round = 0; out.length < slots && round < 4; round++) {
    for (const s of skills) {
      if (out.length >= slots) break;
      const p = candidates.find(c => c.skill === s && !(c.tier === "standard" && standards >= 1));
      if (p) take(p);
    }
  }
  if (frontier && out.length < count) out.push({ ...explorationQuest(frontier.id, effort), local_id: id() });
  return out;
}
