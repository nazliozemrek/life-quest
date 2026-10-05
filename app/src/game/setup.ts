// Goals and places (pillar 4 flow E and F): what the player is working toward and where their life happens.
// Places stay on the phone; only their kind and name ever reach the server or the quest generator, never
// coordinates (pillar 2 privacy zones).
import type { SkillCode } from "../../../src/xp/xp-engine";
import type { Session, Waypoint } from "./session";

export type Horizon = "week" | "month" | "year";
export interface Goal { id: string; title: string; horizon: Horizon; skill: SkillCode | null }

export const GOAL_SUGGESTIONS: { title: string; skill: SkillCode }[] = [
  { title: "Run a 5K", skill: "vitality" },
  { title: "Get stronger at the gym", skill: "vitality" },
  { title: "Sleep 7 hours a night", skill: "vitality" },
  { title: "Learn to code", skill: "craft" },
  { title: "Finish a creative project", skill: "craft" },
  { title: "Save an emergency fund", skill: "wealth" },
  { title: "Land a better job", skill: "wealth" },
  { title: "Make new friends", skill: "charisma" },
  { title: "Learn a new language", skill: "charisma" },
  { title: "Read 12 books this year", skill: "mindset" },
  { title: "Meditate every day", skill: "mindset" },
  { title: "Spend less time on my phone", skill: "mindset" },
];
export const MAX_GOALS = 3;

export type PlaceKind = "home" | "work" | "gym";
export interface Place { kind: PlaceKind; lat: number; lng: number }

export const PLACE_INFO: Record<PlaceKind, { name: string; radiusM: number }> = {
  home: { name: "Home", radiusM: 80 },
  work: { name: "Work", radiusM: 100 },
  gym: { name: "Gym", radiusM: 80 },
};

export function placeWaypoints(places: Place[]): Waypoint[] {
  return places.map(p => ({
    id: `wp_${p.kind}`, kind: p.kind, name: PLACE_INFO[p.kind].name, lat: p.lat, lng: p.lng, radiusM: PLACE_INFO[p.kind].radiusM,
  }));
}

/** Apply goals and places to a player who already has a character (also the last step of character creation). */
export function applySetup(s: Session, goals: Goal[], places: Place[]): Session {
  const profile = s.player.profile;
  if (!profile) return s;
  return {
    ...s,
    waypoints: placeWaypoints(places),
    player: { ...s.player, profile: { ...profile, goals: goals.slice(0, MAX_GOALS), setupDone: true } },
  };
}
