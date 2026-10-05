// Applies planReminders() to the device: asks for permission once, then replaces all of our scheduled
// notifications whenever the plan changes. Web and Expo-less environments do nothing.
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { planReminders } from "../game/reminders";
import type { Session } from "../game/session";
import { useSettings } from "./settings";

const NATIVE = Platform.OS === "ios" || Platform.OS === "android";
const REPLAN_DEBOUNCE_MS = 2000;

if (NATIVE) {
  // A reminder that arrives while the app is open shows as a banner too; it's cheap and the player asked for it.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export function useReminders(session: Session) {
  const { settings, loaded, update, t } = useSettings();
  const asked = useRef(false);

  // First run on the map: ask once. The answer becomes the setting; the player can change it on the character sheet.
  useEffect(() => {
    if (!NATIVE || !loaded || settings.reminders !== null || asked.current) return;
    asked.current = true;
    Notifications.requestPermissionsAsync()
      .then(r => update({ reminders: r.granted }))
      .catch(() => update({ reminders: false }));
  }, [loaded, settings.reminders, update]);

  // What the plan depends on, so walking around (position, fog) doesn't reschedule anything.
  const open = session.quests.filter(e => e.status === "open").length;
  const key = useMemo(
    () => [open, session.quests.length, session.player.streakDays, session.player.profile?.goals?.[0]?.title ?? "", settings.lang].join("|"),
    [open, session.quests.length, session.player.streakDays, session.player.profile?.goals, settings.lang],
  );
  const latest = useRef(session);
  latest.current = session;

  useEffect(() => {
    if (!NATIVE || !loaded || settings.reminders === null) return;
    const timer = setTimeout(async () => {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        if (!settings.reminders) return;
        const { granted } = await Notifications.getPermissionsAsync();
        if (!granted) return;
        for (const r of planReminders(latest.current, new Date(), t)) {
          await Notifications.scheduleNotificationAsync({
            identifier: r.id,
            content: { title: r.title, body: r.body },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
          });
        }
      } catch { /* reminders are best effort */ }
    }, REPLAN_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, loaded, settings.reminders, t]);
}
