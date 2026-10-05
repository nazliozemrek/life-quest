import { describe, expect, it } from "vitest";
import { accrueRested, playerLevels } from "../../src/xp/xp-engine";
import { createSession } from "../src/game/mock-world";
import { dayKey, restore, serialize } from "../src/game/persist";
import { completeQuest, walkTo } from "../src/game/session";

const NOW = Date.UTC(2026, 9, 5, 7, 0);
const fresh = () => createSession(NOW);

/** A session with one quest done and some fog cleared, saved on 2026-10-05. */
function played() {
  let s = fresh();
  const r = completeQuest(s, "q1");
  if (!r.ok) throw new Error(r.reason);
  s = walkTo(r.session, { lat: s.position.lat + 0.003, lng: s.position.lng }).session;
  return { s, raw: JSON.stringify(serialize(s, "2026-10-05")) };
}

describe("saved progress", () => {
  it("resumes exactly on the same day", () => {
    const { s, raw } = played();
    const back = restore(raw, "2026-10-05", fresh);
    expect(back.player).toEqual(s.player);
    expect(back.quests).toEqual(s.quests);
    expect([...back.explored].sort()).toEqual([...s.explored].sort());
    expect([...back.newCells].sort()).toEqual([...s.newCells].sort());
    expect(back.position).toEqual(s.position);
  });

  it("rolls over to a new day: keeps XP and fog, fresh quests, streak +1", () => {
    const { s, raw } = played();
    const back = restore(raw, "2026-10-06", fresh);
    expect(back.player.totalXp).toBe(s.player.totalXp);
    expect(back.explored.size).toBe(s.explored.size);
    expect(back.newCells.size).toBe(0);
    expect(back.quests.every(e => e.status === "open")).toBe(true);
    expect(back.player.streakDays).toBe(s.player.streakDays + 1);
    expect(back.player.rested).toBe(s.player.rested);
    for (const [code, st] of Object.entries(back.player.skills)) {
      expect(st.earnedToday).toBe(0);
      expect(st.idleDays).toBe(s.player.skills[code as keyof typeof s.player.skills].idleDays + 1);
    }
  });

  it("breaks the streak and accrues rested after missed days", () => {
    const { s, raw } = played();
    const back = restore(raw, "2026-10-08", fresh);
    expect(back.player.streakDays).toBe(0);
    expect(back.player.rested).toBe(accrueRested(s.player.rested, 2, playerLevels.levelFor(s.player.totalXp)));
  });

  it("breaks the streak if nothing was completed on the saved day", () => {
    const s = fresh();
    const back = restore(JSON.stringify(serialize(s, "2026-10-05")), "2026-10-06", fresh);
    expect(back.player.streakDays).toBe(0);
  });

  it("starts fresh from missing, corrupt or old-format saves", () => {
    const base = fresh();
    for (const raw of [null, "", "{not json", JSON.stringify({ v: 0 }), "42"]) {
      const back = restore(raw, "2026-10-05", fresh);
      expect(back.player).toEqual(base.player);
      expect(back.quests).toEqual(base.quests);
    }
  });

  it("keys days by local calendar date", () => {
    expect(dayKey(new Date(2026, 0, 9, 23, 59))).toBe("2026-01-09");
  });
});
