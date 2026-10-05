// Local reminders (no server push yet): planned from the session each time it changes, then scheduled on the
// device. Replanning on every change means a reminder never nags about something already done.
//   * Tonight 20:00, if quests are still open: how many are left, and the streak at stake.
//   * Tomorrow 09:00: new quests are ready, naming a goal when there is one.
//   * The two mornings after: skills going rusty. Only fires if the app isn't opened in between.
import { plural, type T } from "../i18n";
import type { Session } from "./session";

export interface Reminder { id: string; at: Date; title: string; body: string }

export const EVENING_HOUR = 20;
export const MORNING_HOUR = 9;

function at(base: Date, dayOffset: number, hour: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function planReminders(s: Session, now: Date, t: T): Reminder[] {
  const out: Reminder[] = [];
  const open = s.quests.filter(e => e.status === "open").length;
  const evening = at(now, 0, EVENING_HOUR);
  if (open > 0 && now < evening) {
    const d = s.player.streakDays;
    out.push({
      id: "lq-evening", at: evening,
      title: plural(t, open, "reminder.evening.title.one", "reminder.evening.title"),
      body: d > 0 ? t("reminder.evening.streak", { d }) : t("reminder.evening.start"),
    });
  }
  const goal = s.player.profile?.goals?.[0]?.title;
  out.push({
    id: "lq-morning-1", at: at(now, 1, MORNING_HOUR), title: t("reminder.morning.title"),
    body: goal ? t("reminder.morning.goal", { goal }) : t("reminder.morning.body"),
  });
  for (const k of [2, 3]) {
    out.push({ id: `lq-morning-${k}`, at: at(now, k, MORNING_HOUR), title: t("reminder.idle.title"), body: t("reminder.idle.body") });
  }
  return out;
}
