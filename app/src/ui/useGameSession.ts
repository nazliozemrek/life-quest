import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Fix } from "../../../src/spatial/spatial-engine";
import type { OnboardingAnswers } from "../../../src/onboarding/calibration";
import { createSession } from "../game/mock-world";
import { CREATION_QUEST, startGame } from "../game/onboarding";
import { SAVE_KEY, dayKey, restore, serialize } from "../game/persist";
import { applyFixes, completeQuest, planWalk, spawnAt, type Session } from "../game/session";
import type { LatLng } from "./map/types";

/** Real time per simulated 10 s GPS fix. Fast enough to feel like a walk, slow enough to watch the fog lift. */
const STEP_MS = 70;
/** Saves are coalesced: a walk commits a fix every few seconds, and storage only needs the latest state. */
const SAVE_DEBOUNCE_MS = 1000;

export type GameEvent =
  | { kind: "xp"; xp: number; title: string; levelUp: number | null }
  | { kind: "error"; message: string };

/** "gps": the phone's location drives the player. "simulated": permission denied or unavailable, tap to walk. */
export type MoveMode = "starting" | "gps" | "simulated";

function toFix(l: Location.LocationObject): Fix {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    t: l.timestamp,
    accuracyM: l.coords.accuracy ?? 999,
    altitudeM: l.coords.altitude ?? undefined,
    isMock: l.mocked === true,       // Android only; iOS doesn't report spoofed fixes
  };
}

export function useGameSession() {
  const [session, setSession] = useState<Session>(createSession);
  // Mirror of the latest state so a walk started mid-walk plans from where the player actually is.
  const latest = useRef(session);
  const [event, setEvent] = useState<(GameEvent & { id: number }) | null>(null);
  const [mode, setMode] = useState<MoveMode>("starting");
  const [loaded, setLoaded] = useState(false);
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

  // Restore saved progress before anything else touches the session.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SAVE_KEY)
      .catch(() => null)
      .then(raw => {
        if (cancelled) return;
        commit(restore(raw, dayKey(new Date()), createSession));
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [commit]);

  // Save after every change once restored. A failed write is retried by the next change.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(SAVE_KEY, JSON.stringify(serialize(session, dayKey(new Date())))).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [session, loaded]);

  // Real location: the first fix spawns the player, every later one goes through validation and fog reveal.
  // Starts after the restore so a spawn can't be overwritten by the saved position.
  useEffect(() => {
    if (!loaded) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let spawned = false;
    (async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (!granted) return setMode("simulated");
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 5 },
          loc => {
            const fix = toFix(loc);
            if (!spawned) {
              spawned = true;
              commit(spawnAt(latest.current, fix).session);
            } else {
              commit(applyFixes(latest.current, [fix]).session);
            }
          },
        );
        if (cancelled) sub.remove();
        else setMode("gps");
      } catch {
        if (!cancelled) setMode("simulated");  // no location services (web preview, some simulators)
      }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [commit, loaded]);

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

  /** Finish character creation: the new player replaces the seed one, and the tutorial quest pays out. */
  const begin = useCallback((name: string, answers: OnboardingAnswers) => {
    const r = startGame(latest.current, name, answers);
    commit(r.session);
    emit({ kind: "xp", xp: CREATION_QUEST.xp, title: CREATION_QUEST.title, levelUp: r.levelUp?.to ?? null });
  }, [commit, emit]);

  return { session, loaded, event, mode, walkTo, complete, begin };
}
