// The red dot on the Around You button: how many new cards from others are waiting, plus the newest as a teaser.
// Checked when the map opens, when the app comes to the front, and every 5 minutes; never in the background.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { unseen, type FeedItem } from "../../game/social";
import { fetchFeed } from "../../net/social";

const KEY = "life-quest/social-seen";
const EVERY_MS = 5 * 60_000;

interface Seen { lastSeen: number; opened: boolean }

export interface Badge {
  count: number;
  peek: FeedItem | null;
  /** Never opened Around You: the dot shows anyway, to invite a first look. */
  firstTime: boolean;
  /** Call when the feed is on screen, with its newest card id. */
  markSeen(topId: string | null): void;
}

export function useAroundYouBadge(enabled: boolean): Badge {
  const seen = useRef<Seen | null>(null);
  const [count, setCount] = useState(0);
  const [peek, setPeek] = useState<FeedItem | null>(null);
  const [firstTime, setFirstTime] = useState(false);

  const store = () => AsyncStorage.setItem(KEY, JSON.stringify(seen.current)).catch(() => {});

  const check = useCallback(async () => {
    if (!enabled) return;
    if (!seen.current) {
      const raw = await AsyncStorage.getItem(KEY).catch(() => null);
      try { seen.current = raw ? JSON.parse(raw) : null; } catch { seen.current = null; }
      seen.current ??= { lastSeen: 0, opened: false };
      setFirstTime(!seen.current.opened);
    }
    const page = await fetchFeed(seen.current.lastSeen ? { after: String(seen.current.lastSeen) } : {});
    if (!page) return;
    const u = unseen(page.items, seen.current.lastSeen);
    setCount(u.count);
    setPeek(u.peek);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    check();
    const id = setInterval(check, EVERY_MS);
    const sub = AppState.addEventListener("change", s => { if (s === "active") check(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [enabled, check]);

  const markSeen = useCallback((topId: string | null) => {
    const prev = seen.current ?? { lastSeen: 0, opened: false };
    seen.current = { lastSeen: Math.max(prev.lastSeen, topId ? Number(topId) : 0), opened: true };
    store();
    setCount(0);
    setPeek(null);
    setFirstTime(false);
  }, []);

  return { count, peek, firstTime, markSeen };
}
