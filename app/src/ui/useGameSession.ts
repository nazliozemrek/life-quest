import { useCallback, useEffect, useRef, useState } from "react";
import { createSession } from "../game/mock-world";
import { applyFixes, completeQuest, planWalk, type Session } from "../game/session";
import type { LatLng } from "./map/types";

/** Real time per simulated 10 s GPS fix. Fast enough to feel like a walk, slow enough to watch the fog lift. */
const STEP_MS = 70;

export type GameEvent =
  | { kind: "xp"; xp: number; title: string; levelUp: number | null }
  | { kind: "error"; message: string };

export function useGameSession() {
  const [session, setSession] = useState<Session>(createSession);
  // Mirror of the latest state so a walk started mid-walk plans from where the player actually is.
  const latest = useRef(session);
  const [event, setEvent] = useState<(GameEvent & { id: number }) | null>(null);
  const walkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventId = useRef(0);

  const commit = useCallback((next: Session) => {
    latest.current = next;
    setSession(next);
  }, []);

  const emit = useCallback((e: GameEvent) => setEvent({ ...e, id: ++eventId.current }), []);

  const stopWalk = useCallback(() => {
    if (walkTimer.current) clearInterval(walkTimer.current);
    walkTimer.current = null;
  }, []);

  useEffect(() => stopWalk, [stopWalk]);

  /** Walk to target, feeding one simulated fix per tick through the real validation and fog reveal. */
  const walkTo = useCallback((target: LatLng) => {
    stopWalk();
    const fixes = planWalk(latest.current.position, target);
    let i = 0;
    walkTimer.current = setInterval(() => {
      const fix = fixes[i++];
      if (!fix) return stopWalk();
      commit(applyFixes(latest.current, [fix]).session);
    }, STEP_MS);
  }, [stopWalk, commit]);

  const complete = useCallback((localId: string) => {
    const s = latest.current;
    const r = completeQuest(s, localId);
    if (!r.ok) return emit({ kind: "error", message: r.reason });
    commit(r.session);
    const title = s.quests.find(e => e.quest.local_id === localId)!.quest.title;
    emit({ kind: "xp", xp: r.award.totalXp, title, levelUp: r.levelUp?.to ?? null });
  }, [commit, emit]);

  return { session, event, walkTo, complete };
}
