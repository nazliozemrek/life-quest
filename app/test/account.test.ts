import { describe, expect, it } from "vitest";
import { createSession } from "../src/game/mock-world";
import { SKIPPED, startGame } from "../src/game/onboarding";
import { poolQuests } from "../src/game/context";
import { applySetup } from "../src/game/setup";
import { completeQuest } from "../src/game/session";
import { cloudSave, fromCloud } from "../src/game/cloudsave";

const NOW = Date.UTC(2026, 9, 5, 7, 0);
const answers = { ...SKIPPED, focusClass: "bard" as const, healthLimit: "mild" as const, income: "precarious" as const };

function played() {
  const s0 = startGame(createSession(NOW), "Kaan", answers, NOW).session;
  const s1 = applySetup(s0, [{ id: "g1", title: "Run a 5K", horizon: "month", skill: "vitality" }],
    [{ kind: "home", lat: s0.position.lat + 0.001, lng: s0.position.lng }]);
  const q = s1.quests.find(e => e.quest.location.type === "none")!.quest;
  const r = completeQuest(s1, q.local_id);
  if (!r.ok) throw new Error(r.reason.key);
  return r.session;
}

describe("cloud save", () => {
  it("never uploads raw answers, places, position or fog", () => {
    const s = played();
    const up = cloudSave(s, "2026-10-05");
    const json = JSON.stringify(up);
    expect(up.player.profile!.answers).toEqual(SKIPPED);
    expect(json).not.toContain("precarious");
    expect(json).not.toContain(String(s.position.lat));
    expect(up).not.toHaveProperty("waypoints");
    expect(up.explored).toEqual([]);
  });

  it("restores level, skills, goals and fog on a new phone, same day", () => {
    const s = played();
    const back = fromCloud(cloudSave(s, "2026-10-05"), [...s.explored], "2026-10-05", () => createSession(NOW), poolQuests);
    expect(back.player.totalXp).toBe(s.player.totalXp);
    expect(back.player.skills).toEqual(s.player.skills);
    expect(back.player.profile!.goals).toEqual(s.player.profile!.goals);
    expect(back.quests).toEqual(s.quests);
    expect(back.explored.size).toBe(s.explored.size);
  });

  it("rolls into a new day like a normal load", () => {
    const s = played();
    const back = fromCloud(cloudSave(s, "2026-10-05"), [], "2026-10-06", () => createSession(NOW), poolQuests);
    expect(back.player.streakDays).toBe(s.player.streakDays + 1);
    expect(back.quests.every(e => e.status === "open")).toBe(true);
  });
});
