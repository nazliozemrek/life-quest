// The game save as it goes to the cloud for backup, and back. Pure, so it's tested without React Native.
import { SKIPPED } from "./onboarding";
import { restore, type SavedGame } from "./persist";
import type { QuestEntry, Session } from "./session";

/** The save as uploaded: without raw answers, places, position and fog, which stay on (or sync apart from) the phone. */
export function cloudSave(s: Session, day: string): SavedGame {
  const p = s.player;
  return {
    v: 1, day, quests: s.quests, explored: [], newCells: [],
    position: { lat: 0, lng: 0, t: 0, accuracyM: 999 },
    // Places stay on the phone, so a restored character is asked for them again (its goals carry over).
    player: p.profile ? { ...p, profile: { ...p.profile, answers: SKIPPED, setupDone: false } } : p,
  };
}

/** A session from a cloud save plus the fog cells from the server, in this phone's world. */
export function fromCloud(
  save: SavedGame, cells: string[], today: string, fresh: () => Session,
  newDayQuests: (s: Session, day: string) => QuestEntry[],
): Session {
  const base = fresh();
  // Saves uploaded before setupDone was cleared on upload still say true; places never come back from the cloud.
  const p = save.player;
  const player = p.profile ? { ...p, profile: { ...p.profile, setupDone: false } } : p;
  return restore(JSON.stringify({ ...save, player, explored: cells, newCells: [], position: base.position }), today, fresh, newDayQuests);
}
