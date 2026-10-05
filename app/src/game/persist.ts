// Save and restore the game session on the device, and roll it over to a new day.
// Pure functions; the hook in ui/useGameSession.ts does the storage I/O. Until the API exists this is the
// player's only copy of their progress, so restore() never throws: anything it can't read starts fresh.
import { accrueRested, playerLevels, type SkillCode } from "../../../src/xp/xp-engine";
import type { Fix } from "../../../src/spatial/spatial-engine";
import { SKILLS, type Player, type QuestEntry, type Session } from "./session";

export const SAVE_KEY = "life-quest/session";
const VERSION = 1;

export interface SavedGame {
  v: typeof VERSION;
  day: string;                 // local calendar day the quests belong to, YYYY-MM-DD
  player: Player;
  quests: QuestEntry[];
  explored: string[];
  newCells: string[];
  position: Fix;
}

/** Local calendar day, so "today's quests" turn over at the player's midnight, not UTC's. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function serialize(s: Session, day: string): SavedGame {
  return {
    v: VERSION, day, player: s.player, quests: s.quests,
    explored: [...s.explored], newCells: [...s.newCells], position: s.position,
  };
}

function isSavedGame(x: unknown): x is SavedGame {
  const g = x as SavedGame;
  return !!g && g.v === VERSION && typeof g.day === "string" && !!g.player && Array.isArray(g.quests)
    && Array.isArray(g.explored) && Array.isArray(g.newCells) && !!g.position;
}

/**
 * Rebuild a session from storage. Same day: carry on exactly where the player left off. Later day: keep XP,
 * levels and the explored map, issue a fresh quest batch, and apply the day boundary to streak, Form and rested.
 * `fresh` supplies the world (waypoints, district names); `newDayQuests` the new day's set (default: fresh's).
 */
export function restore(
  raw: string | null, today: string, fresh: () => Session,
  newDayQuests: (s: Session, day: string) => QuestEntry[] = () => fresh().quests,
): Session {
  const base = fresh();
  let saved: unknown;
  try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
  if (!isSavedGame(saved)) return base;

  const gap = daysBetween(saved.day, today);
  const kept: Session = {
    ...base,
    player: saved.player,
    explored: new Set(saved.explored),
    position: saved.position,
  };
  // Same day, or the clock went backwards: resume as saved.
  if (gap <= 0) return { ...kept, quests: saved.quests, newCells: new Set(saved.newCells) };

  const p = saved.player;
  const playedLastDay = saved.quests.some(e => e.status === "done");
  const skills = {} as Player["skills"];
  for (const code of SKILLS as SkillCode[]) {
    skills[code] = { ...p.skills[code], idleDays: p.skills[code].idleDays + gap, earnedToday: 0 };
  }
  // A streak survives only into the very next day, and only if something was completed on the saved day.
  const streakDays = gap === 1 && playedLastDay ? p.streakDays + 1 : 0;
  // Rested grows for every whole day with no play: the days skipped, plus the saved day if it was idle.
  const idleDays = gap - 1 + (playedLastDay ? 0 : 1);
  const rested = accrueRested(p.rested, idleDays, playerLevels.levelFor(p.totalXp));

  const rolled: Session = { ...kept, player: { ...p, skills, streakDays, rested }, quests: [], newCells: new Set() };
  return { ...rolled, quests: newDayQuests(rolled, today) };
}
