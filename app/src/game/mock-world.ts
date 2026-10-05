// Seed data for the first screen until the API exists: one player in Moda, Kadıköy, mid-game.
// MOCK_QUESTS is a batch exactly as the quest generator returns it after validateBatch; test/mock-world.test.ts
// holds it to that contract so the UI is never built against a shape the LLM can't produce.
import { latLngToCell } from "h3-js";
import { FOG_RES, districtOf } from "../../../src/spatial/spatial-engine";
import type { Quest } from "../../../src/quests/quest-generator";
import { applyFixes, planWalk, type Player, type Session, type Waypoint } from "./session";

export const HOME = { lat: 40.9862, lng: 29.0262 };

export const WAYPOINTS: Waypoint[] = [
  { id: "wp_home", kind: "home", name: "Home", lat: HOME.lat, lng: HOME.lng, radiusM: 60 },
  { id: "wp_gym", kind: "gym", name: "Iron Hall Gym", lat: 40.9907, lng: 29.0301, radiusM: 60 },
  { id: "wp_moda_coast", kind: "park", name: "Moda Coast", lat: 40.9806, lng: 29.0236, radiusM: 80 },
];

/** The district just east of home: unexplored, close enough to walk to. */
export const FRONTIER_DISTRICT = districtOf(latLngToCell(40.9845, 29.0395, FOG_RES));
const HOME_DISTRICT = districtOf(latLngToCell(HOME.lat, HOME.lng, FOG_RES));

export const DISTRICT_NAMES: Record<string, string> = {
  [HOME_DISTRICT]: "Moda",
  ...(FRONTIER_DISTRICT !== HOME_DISTRICT ? { [FRONTIER_DISTRICT]: "Eastern Reach" } : {}),
};

export const MOCK_PLAYER: Player = {
  name: "Kaan",
  difficulty: "normal",
  totalXp: 4_820,
  rested: 140,
  streakDays: 9,
  skills: {
    vitality: { xp: 2_350, idleDays: 1, earnedToday: 0 },
    craft: { xp: 3_100, idleDays: 0, earnedToday: 0 },
    wealth: { xp: 640, idleDays: 21, earnedToday: 0 },
    charisma: { xp: 910, idleDays: 9, earnedToday: 0 },
    mindset: { xp: 1_480, idleDays: 3, earnedToday: 0 },
  },
};

export const MOCK_QUESTS: Quest[] = [
  {
    local_id: "q1", kind: "daily",
    title: "Drink from the Morning Spring",
    flavor_text: "Every adventurer starts the day by refilling their flask.",
    objective: "Drink a full glass of water within an hour of waking up.",
    success: { type: "checkbox", target: null, unit: null },
    tier: "trivial", effort: 1, skill_weights: [{ skill: "vitality", weight: 1 }],
    verification: "self", location: { type: "none", ref: null },
    window: { due_in_hours: 4, best_time: "morning" }, estimated_minutes: 1,
    prerequisites: [], chain: null,
    rationale: "Streak keeper: a guaranteed early win.",
  },
  {
    local_id: "q2", kind: "daily",
    title: "Forge 25 Minutes of Deep Work",
    flavor_text: "The forge only answers to unbroken focus.",
    objective: "Work on your main project for 25 minutes with notifications off.",
    success: { type: "duration_minutes", target: 25, unit: "minutes" },
    tier: "standard", effort: 1, skill_weights: [{ skill: "craft", weight: 0.75 }, { skill: "mindset", weight: 0.25 }],
    verification: "sensor", location: { type: "none", ref: null },
    window: { due_in_hours: 10, best_time: "midday" }, estimated_minutes: 25,
    prerequisites: [], chain: null,
    rationale: "Craft is the player's top goal skill; one focused block per day.",
  },
  {
    local_id: "q3", kind: "side",
    title: "Train at the Iron Hall",
    flavor_text: "The Iron Hall keeps a ledger of everyone who shows up.",
    objective: "Spend 45 minutes at the gym.",
    success: { type: "geofence_dwell", target: 45, unit: "minutes" },
    tier: "standard", effort: 1.2, skill_weights: [{ skill: "vitality", weight: 0.75 }, { skill: "mindset", weight: 0.25 }],
    verification: "sensor", location: { type: "waypoint", ref: "wp_gym" },
    window: { due_in_hours: 12, best_time: "evening" }, estimated_minutes: 60,
    prerequisites: [], chain: null,
    rationale: "Three gym visits a week is an active goal; last visit was two days ago.",
  },
  {
    local_id: "q4", kind: "exploration",
    title: "Chart the Fog East of Moda",
    flavor_text: "The mapmakers left this quarter blank. Fix that.",
    objective: "Walk the streets of the district east of home until 15 new map cells are revealed.",
    success: { type: "count", target: 15, unit: "cells" },
    tier: "minor", effort: 1.2, skill_weights: [{ skill: "vitality", weight: 0.5 }, { skill: "mindset", weight: 0.5 }],
    verification: "self", location: { type: "district", ref: FRONTIER_DISTRICT },
    window: { due_in_hours: 48, best_time: "weekend" }, estimated_minutes: 40,
    prerequisites: [], chain: null,
    rationale: "Nearest frontier district, 1 km away and 0% explored.",
  },
  {
    local_id: "q5", kind: "side",
    title: "Audit the Coin Purse",
    flavor_text: "Gold leaks from purses nobody counts.",
    objective: "List every subscription you pay for and what each one costs per month.",
    success: { type: "checkbox", target: null, unit: null },
    tier: "minor", effort: 1, skill_weights: [{ skill: "wealth", weight: 1 }],
    verification: "self", location: { type: "none", ref: null },
    window: { due_in_hours: 24, best_time: "evening" }, estimated_minutes: 15,
    prerequisites: [], chain: null,
    rationale: "Wealth has been idle for 21 days; a quick win earns the comeback bonus.",
  },
  {
    local_id: "q6", kind: "side",
    title: "Seal One Leak in the Treasury",
    flavor_text: "One cut today is gold every month after.",
    objective: "Cancel one subscription from your list that you no longer use.",
    success: { type: "checkbox", target: null, unit: null },
    tier: "minor", effort: 1, skill_weights: [{ skill: "wealth", weight: 1 }],
    verification: "self", location: { type: "none", ref: null },
    window: { due_in_hours: 24, best_time: "any" }, estimated_minutes: 10,
    prerequisites: ["q5"], chain: null,
    rationale: "Follows the audit while the list is fresh.",
  },
  {
    local_id: "q7", kind: "side",
    title: "Watch the Sun Sink at Moda Coast",
    flavor_text: "Even heroes stop to watch the light leave the water.",
    objective: "Spend 10 phone-free minutes at Moda Coast at sunset.",
    success: { type: "geofence_dwell", target: 10, unit: "minutes" },
    tier: "minor", effort: 1, skill_weights: [{ skill: "mindset", weight: 1 }],
    verification: "sensor", location: { type: "waypoint", ref: "wp_moda_coast" },
    window: { due_in_hours: 10, best_time: "evening" }, estimated_minutes: 25,
    prerequisites: [], chain: null,
    rationale: "Low-effort mindset quest near home for the evening slot.",
  },
];

/** A few past walks around home so the map opens with explored streets instead of solid fog. */
const PAST_WALKS = [
  { lat: 40.9885, lng: 29.0262 }, { lat: 40.9885, lng: 29.0300 }, { lat: 40.9862, lng: 29.0300 },
  { lat: 40.9830, lng: 29.0250 }, { lat: 40.9812, lng: 29.0236 }, { lat: 40.9840, lng: 29.0240 }, HOME,
];

export function createSession(now = Date.now()): Session {
  let s: Session = {
    player: MOCK_PLAYER,
    quests: MOCK_QUESTS.map(quest => ({ quest, status: "open" })),
    waypoints: WAYPOINTS,
    districtNames: DISTRICT_NAMES,
    explored: new Set(),
    newCells: new Set(),
    position: { ...HOME, t: now - 3 * 3600_000, accuracyM: 5 },
  };
  for (const p of PAST_WALKS) s = applyFixes(s, planWalk(s.position, p)).session;
  // History ends at home, a minute ago. Only cells revealed from here on count toward exploration quests.
  return { ...s, newCells: new Set(), position: { ...s.position, t: now - 60_000 } };
}
