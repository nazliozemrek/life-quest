import { describe, expect, it } from "vitest";
import { makeT } from "../src/i18n";
import { createSession } from "../src/game/mock-world";
import { planReminders } from "../src/game/reminders";
import type { Session } from "../src/game/session";

const s0 = createSession(Date.UTC(2026, 9, 5, 7, 0));
const local = (h: number) => { const d = new Date(2026, 9, 5, h, 30); return d; };
const done = (s: Session, n: number): Session => ({ ...s, quests: s.quests.map((e, i) => (i < n ? { ...e, status: "done" as const } : e)) });

describe("reminders", () => {
  it("nudges tonight with what's left, then plans three mornings", () => {
    const s = { ...done(s0, 4), player: { ...s0.player, streakDays: 3 } };
    const r = planReminders(s, local(14), makeT("en"));
    expect(r.map(x => x.id)).toEqual(["lq-evening", "lq-morning-1", "lq-morning-2", "lq-morning-3"]);
    expect(r[0]).toMatchObject({ title: `${s.quests.length - 4} quests left today`, body: "Keep your 3-day streak alive." });
    expect(r[0].at.getHours()).toBe(20);
    expect(r[1].at.getDate()).toBe(6);
    expect(r[1].at.getHours()).toBe(9);
  });

  it("skips tonight when everything is done or it's already past 20:00", () => {
    expect(planReminders(done(s0, 99), local(14), makeT("en"))[0].id).toBe("lq-morning-1");
    expect(planReminders(s0, local(21), makeT("en"))[0].id).toBe("lq-morning-1");
  });

  it("speaks Turkish", () => {
    const r = planReminders(done(s0, s0.quests.length - 1), local(10), makeT("tr"));
    expect(r[0].title).toBe("Bugün 1 görev kaldı");
    expect(r[1].title).toBe("Yeni görevler hazır");
  });
});
