// Keeps Supabase in step with the on-device game: flushes the outbox and fetches today's server quest set.
// Everything here is best-effort. Offline, signed out or unconfigured, the game plays exactly the same.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { AppState } from "react-native";
import type { Quest } from "../../../src/quests/quest-generator";
import { calibrate } from "../../../src/onboarding/calibration";
import { playerContext } from "../game/context";
import { CREATION_QUEST } from "../game/onboarding";
import { dayKey } from "../game/persist";
import type { Session } from "../game/session";
import { creationOps, flush, profileOp, type Db, type SyncOp } from "./outbox";
import { ensureSignedIn, supabase } from "./supabase";

const SYNC_KEY = "life-quest/sync";
const FLUSH_DEBOUNCE_MS = 3000;

interface SyncState { ops: SyncOp[]; synced: string[]; bootstrapped: boolean }

export function useCloudSync(
  loaded: boolean, session: Session, latest: MutableRefObject<Session>, commit: (s: Session) => void,
) {
  const state = useRef<SyncState | null>(null);
  const flushing = useRef(false);
  const fetchedDay = useRef<string | null>(null);

  const save = () => AsyncStorage.setItem(SYNC_KEY, JSON.stringify(state.current)).catch(() => {});

  const run = useCallback(async () => {
    const st = state.current;
    if (!supabase || !st || flushing.current || !latest.current.player.profile) return;
    flushing.current = true;
    try {
      if (!(await ensureSignedIn())) return;
      const before = st.ops.length;
      const r = await flush(supabase as unknown as Db, st.ops, latest.current.explored, new Set(st.synced));
      // Ops queued while the flush was in flight sit after the ones it saw.
      state.current = { ...st, ops: [...r.remaining, ...state.current!.ops.slice(before)], synced: [...r.synced] };
      save();
      await fetchQuests();
    } catch {
      // Network gone mid-flush: everything left is still queued.
    } finally {
      flushing.current = false;
    }
  }, [latest]);

  /** Today's set from the server: AI-written when the backend has an API key. Replaces the pool set only if
   *  nothing has been completed yet, so quest ids never change under a finished quest. */
  const fetchQuests = async () => {
    const today = dayKey(new Date());
    if (!supabase || fetchedDay.current === today) return;
    const s = latest.current;
    const { data, error } = await supabase.functions.invoke("daily-quests", {
      body: { day: today, context: playerContext(s, new Date()) },
    });
    if (error || !data?.quests?.length || data.day !== today) return;
    fetchedDay.current = today;
    const now = latest.current;
    if (now.quests.some(e => e.status === "done")) return;
    commit({ ...now, quests: (data.quests as Quest[]).map(quest => ({ quest, status: "open" as const })) });
  };

  const enqueue = useCallback((...ops: (SyncOp | null)[]) => {
    if (!state.current) return;
    state.current = { ...state.current, ops: [...state.current.ops, ...ops.filter((o): o is SyncOp => !!o)] };
    save();
  }, []);

  // Load the queue once the game is restored. A player who made their character before the backend existed
  // gets their profile and starting XP queued once.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    AsyncStorage.getItem(SYNC_KEY).catch(() => null).then(raw => {
      if (cancelled) return;
      let st: SyncState = { ops: [], synced: [], bootstrapped: false };
      try { if (raw) st = { ...st, ...JSON.parse(raw) }; } catch { /* corrupt: start over, writes are idempotent */ }
      state.current = st;
      const p = latest.current.player;
      if (!st.bootstrapped && p.profile) {
        state.current = { ...st, bootstrapped: true };
        enqueue(profileOp(p), ...creationOps(calibrate(p.profile.answers), CREATION_QUEST.xp));
      }
      run();
    });
    return () => { cancelled = true; };
  }, [loaded, enqueue, run, latest]);

  // Flush shortly after any change (a quest, new fog), and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(run, FLUSH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [session, loaded, run]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", s => { if (s === "active") run(); });
    return () => sub.remove();
  }, [run]);

  /** Mark the queue as covering this character from creation on, so bootstrap never double-queues it. */
  const markCreated = useCallback(() => {
    if (state.current) state.current = { ...state.current, bootstrapped: true };
  }, []);

  return useMemo(() => ({ enqueue, markCreated }), [enqueue, markCreated]);
}
