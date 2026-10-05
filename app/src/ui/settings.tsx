// Device settings: language and reminders. Kept apart from the game save so a reset or a restored game never
// changes them, and never synced.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { makeT, type Lang, type T } from "../i18n";

const KEY = "life-quest/settings";

export interface Settings {
  lang: Lang;
  /** null: never asked. The first time the map opens we ask the OS, and store the answer here. */
  reminders: boolean | null;
}

function deviceLang(): Lang {
  try { return getLocales()[0]?.languageCode === "tr" ? "tr" : "en"; } catch { return "en"; }
}

interface Ctx { settings: Settings; loaded: boolean; update(patch: Partial<Settings>): void; t: T }
const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({ lang: deviceLang(), reminders: null }));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).catch(() => null).then(raw => {
      try { if (raw) setSettings(s => ({ ...s, ...JSON.parse(raw) })); } catch { /* keep defaults */ }
      setLoaded(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(s => {
      const next = { ...s, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const t = useMemo(() => makeT(settings.lang), [settings.lang]);
  const value = useMemo(() => ({ settings, loaded, update, t }), [settings, loaded, update, t]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsContext);
  if (!c) throw new Error("useSettings outside SettingsProvider");
  return c;
}

/** Shorthand for components that only need strings. */
export const useT = (): T => useSettings().t;
