import { describe, expect, it } from "vitest";
import { createSession } from "../src/game/mock-world";
import { SKIPPED, startGame } from "../src/game/onboarding";
import { playerContext, poolQuests } from "../src/game/context";
import { restore, serialize } from "../src/game/persist";
import { MAX_GOALS, applySetup, type Goal, type Place } from "../src/game/setup";

const NOW = Date.UTC(2026, 9, 5, 7, 0);
const player = () => startGame(createSession(NOW), "Kaan", { ...SKIPPED, focusClass: "artisan" }, NOW).session;
const s0 = createSession(NOW);
const GYM: Place = { kind: "gym", lat: s0.position.lat + 0.002, lng: s0.position.lng };
const WORK: Place = { kind: "work", lat: s0.position.lat - 0.004, lng: s0.position.lng + 0.003 };
const goal = (id: string, skill: Goal["skill"]): Goal => ({ id, title: `Goal ${id}`, horizon: "month", skill });

describe("goals and places", () => {
  it("turns places into the player's waypoints and marks setup done", () => {
    const s = applySetup(player(), [goal("a", "vitality")], [GYM, WORK]);
    expect(s.waypoints.map(w => w.id)).toEqual(["wp_gym", "wp_work"]);
    expect(s.waypoints[0]).toMatchObject({ lat: GYM.lat, lng: GYM.lng, name: "Gym" });
    expect(s.player.profile!.setupDone).toBe(true);
    expect(s.player.profile!.goals).toHaveLength(1);
  });

  it("keeps at most three goals and does nothing before character creation", () => {
    const many = ["a", "b", "c", "d"].map(id => goal(id, null));
    expect(applySetup(player(), many, []).player.profile!.goals).toHaveLength(MAX_GOALS);
    const before = createSession(NOW);
    expect(applySetup(before, many, [GYM])).toBe(before);
  });

  it("saves places with the game", () => {
    const s = applySetup(player(), [], [GYM]);
    const back = restore(JSON.stringify(serialize(s, "2026-10-05")), "2026-10-05", () => createSession(NOW));
    expect(back.waypoints).toEqual(s.waypoints);
    expect(back.player.profile!.setupDone).toBe(true);
  });

  it("tells the quest generator the goals and place names, never coordinates", () => {
    const s = applySetup(player(), [goal("a", "vitality")], [GYM]);
    const ctx = playerContext(s, new Date(NOW));
    expect(ctx.goals.map(g => g.title)).toEqual(["Goal a"]);
    expect(JSON.stringify(ctx.waypoints)).not.toContain(String(GYM.lat));
    expect(ctx.waypoints.map(w => w.kind)).toEqual(["gym"]);
  });

  it("gives gym quests once a gym is pinned", () => {
    const withGym = applySetup(player(), [goal("a", "vitality")], [GYM]);
    const days = ["2026-10-05", "2026-10-06", "2026-10-07"];
    const places = days.flatMap(d => poolQuests(withGym, d)).filter(e => e.quest.location.type === "waypoint");
    expect(places.length).toBeGreaterThan(0);
    expect(places.every(e => e.quest.location.ref === "wp_gym")).toBe(true);
    const none = days.flatMap(d => poolQuests(applySetup(player(), [], []), d)).filter(e => e.quest.location.type === "waypoint");
    expect(none).toEqual([]);
  });
});
