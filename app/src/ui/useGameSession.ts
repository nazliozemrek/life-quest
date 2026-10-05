import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Fix } from "../../../src/spatial/spatial-engine";
import type { OnboardingAnswers } from "../../../src/onboarding/calibration";
import { createSession } from "../game/mock-world";
import { poolQuests } from "../game/context";
import { CREATION_QUEST, startGame } from "../game/onboarding";
import { applySetup, type Goal, type Place } from "../game/setup";
import { SAVE_KEY, dayKey, restore, serialize } from "../game/persist";
import { applyFixes, completeQuest, planWalk, spawnAt, type Session } from "../game/session";
import { creationOps, goalsOp, nodeOp, profileOp, questOp } from "../net/outbox";
import { unlockNode } from "../game/skilltree";
import { useCloudSync } from "../net/useCloudSync";
import { buzz } from "./haptics";
import { msg, type Msg } from "../i18n";
import { nodeName } from "../game/skilltree";
import type { LatLng } from "./map/types";

/** Real time per simulated 10 s GPS fix. Fast enough to feel like a walk, slow enough to watch the fog lift. */
const STEP_MS = 70;
/** Saves are coalesced: a walk commits a fix every few seconds, and storage only needs the latest state. */
const SAVE_DEBOUNCE_MS = 1000;

export type GameEvent =
  | { kind: "xp"; xp: number; title: string; rationale?: string; levelUp: number | null }   // title/rationale: for questText
  | { kind: "error"; message: Msg }
  | { kind: "info"; title: Msg };

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

/** Goals and places change which quests fit, so today's set is re-picked, unless the player already started on it. */
function withSetup(s: Session, goals: Goal[], places: Place[]): Session {
  const next = applySetup(s, goals, places);
  if (next.quests.some(e => e.status === "done")) return next;
  return { ...next, quests: poolQuests(next, dayKey(new Date())) };
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

  const emit = useCallback((e: GameEvent) => {
    buzz(e);
    setEvent({ ...e, id: ++eventId.current });
  }, []);

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
        commit(restore(raw, dayKey(new Date()), createSession, poolQuests));
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

  const cloud = useCloudSync(loaded, session, latest, commit,
    () => emit({ kind: "info", title: msg("toast.newQuests") }));

  const complete = useCallback((localId: string, title: string) => {
    const s = latest.current;
    // The list can be replaced by the server's set between render and tap; only complete what the player saw.
    if (s.quests.find(e => e.quest.local_id === localId)?.quest.title !== title) return;
    const r = completeQuest(s, localId);
    if (!r.ok) return emit({ kind: "error", message: r.reason });
    commit(r.session);
    const quest = s.quests.find(e => e.quest.local_id === localId)!.quest;
    emit({ kind: "xp", xp: r.award.totalXp, title, rationale: quest.rationale, levelUp: r.levelUp?.to ?? null });
    cloud.enqueue(questOp(dayKey(new Date()), localId, title, r.award));
  }, [commit, emit, cloud]);

  /** Finish character creation: the new player replaces the seed one, and the tutorial quest pays out. */
  const begin = useCallback((name: string, answers: OnboardingAnswers, goals: Goal[], places: Place[]) => {
    const r = startGame(latest.current, name, answers);
    const s = withSetup(r.session, goals, places);
    commit(s);
    emit({ kind: "xp", xp: CREATION_QUEST.xp, title: CREATION_QUEST.title, levelUp: r.levelUp?.to ?? null });
    cloud.markCreated();
    cloud.enqueue(profileOp(r.session.player), ...creationOps(r.calibration, CREATION_QUEST.xp), goalsOp(goals));
  }, [commit, emit, cloud]);

  /** Goals and places for a character made before they existed. Places never leave the phone. */
  const finishSetup = useCallback((goals: Goal[], places: Place[]) => {
    commit(withSetup(latest.current, goals, places));
    cloud.enqueue(goalsOp(goals));
  }, [commit, cloud]);

  /** Buy a skill tree node. The rules are checked again here, so a stale screen can't overspend. */
  const unlock = useCallback((id: string) => {
    const s = latest.current;
    const r = unlockNode(s.player, id);
    if (!r.ok) return emit({ kind: "error", message: r.reason });
    commit({ ...s, player: r.player });
    emit({ kind: "info", title: msg("toast.unlocked", { node: nodeName(id) }) });
    cloud.enqueue(nodeOp(id));
  }, [commit, emit, cloud]);

  const setTitle = useCallback((title: string | null) => {
    const s = latest.current;
    commit({ ...s, player: { ...s.player, title: title ?? undefined } });
  }, [commit]);

  /** Replace this phone's game with one restored from the cloud. */
  const adoptRestored = useCallback((restored: Session, cells: string[]) => {
    commit(restored);
    cloud.adopt(cells);
    emit({ kind: "info", title: msg("account.restored", { name: restored.player.name }) });
  }, [commit, cloud, emit]);

  return { session, loaded, event, mode, walkTo, complete, begin, finishSetup, unlock, setTitle, adoptRestored };
}
