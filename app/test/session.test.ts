import { translate, type Msg } from "../src/i18n";
import { describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import { QuestBatchSchema, validateBatch, type PlayerContext } from "../../src/quests/quest-generator";
import { FOG_RES, districtOf } from "../../src/spatial/spatial-engine";
import { playerLevels } from "../../src/xp/xp-engine";
import { FRONTIER_DISTRICT, MOCK_QUESTS, WAYPOINTS, createSession } from "../src/game/mock-world";
import { makeProjection } from "../src/game/projection";
import { applyFixes, completeQuest, hud, planWalk, previewAward, questGate, spawnAt, walkTo } from "../src/game/session";

const NOW = Date.UTC(2026, 9, 5, 7, 0);
const gym = WAYPOINTS.find(w => w.id === "wp_gym")!;

const en = (m: Msg) => translate("en", m.key, m.params);

describe("mock quest batch", () => {
  it("is a batch the generator contract accepts unchanged", () => {
    const batch = QuestBatchSchema.parse({ quests: MOCK_QUESTS });
    const ctx = {
      waypoints: WAYPOINTS.map(({ id, kind, name }) => ({ id, kind, name })),
      frontierDistricts: [{ id: FRONTIER_DISTRICT, pctExplored: 0, distanceKm: 1 }],
      recentQuestTitles: [],
      request: { kind: "daily_set", count: MOCK_QUESTS.length },
    } as unknown as PlayerContext;
    const { quests, issues } = validateBatch(batch, ctx);
    expect(issues).toEqual([]);
    expect(quests).toHaveLength(MOCK_QUESTS.length);
  });
});

describe("session", () => {
  it("opens at home with explored streets and nothing counted toward exploration", () => {
    const s = createSession(NOW);
    expect(s.explored.size).toBeGreaterThan(30);
    expect(s.newCells.size).toBe(0);
    const h = hud(s);
    expect(h.level).toBe(playerLevels.levelFor(4_820));
    expect(h.pct).toBeGreaterThan(0);
    expect(h.pct + h.restedPct).toBeLessThanOrEqual(1);
    expect(h.district.name).toBe("Moda");
  });

  it("completing a quest pays exactly the previewed award into player and skills", () => {
    const s = createSession(NOW);
    const q2 = s.quests.find(e => e.quest.local_id === "q2")!.quest;
    const preview = previewAward(s, q2);
    const r = completeQuest(s, "q2");
    if (!r.ok) throw new Error(r.reason.key);
    expect(r.award.totalXp).toBe(preview.totalXp);
    expect(r.session.player.totalXp).toBe(s.player.totalXp + preview.totalXp);
    expect(r.session.player.rested).toBe(s.player.rested - preview.restedConsumed);
    expect(r.session.player.skills.craft.xp).toBe(s.player.skills.craft.xp + preview.perSkill.craft!);
    expect(r.session.quests.find(e => e.quest.local_id === "q2")!.status).toBe("done");
    expect(completeQuest(r.session, "q2")).toMatchObject({ ok: false, reason: { key: "gate.alreadyDone" } });
  });

  it("idle skills earn the comeback bonus and lose it once trained", () => {
    const s = createSession(NOW);
    const q5 = s.quests.find(e => e.quest.local_id === "q5")!.quest;
    const q6 = s.quests.find(e => e.quest.local_id === "q6")!.quest;
    // Same tier and weights; only wealth's Form differs between the two awards.
    const first = completeQuest(s, "q5");
    if (!first.ok) throw new Error(first.reason.key);
    expect(first.award.perSkill.wealth!).toBeGreaterThan(previewAward(first.session, q6).perSkill.wealth!);
    const g6 = questGate(s, q6);
    expect(!g6.ok && en(g6.reason)).toBe(`Finish "${q5.title}" first`);
    expect(questGate(first.session, q6)).toEqual({ ok: true });
  });

  it("flags a level up when the award crosses a boundary", () => {
    const s = createSession(NOW);
    const edge = playerLevels.xpToReach(hud(s).level + 1) - 1;
    const r = completeQuest({ ...s, player: { ...s.player, totalXp: edge } }, "q1");
    if (!r.ok) throw new Error(r.reason.key);
    expect(r.levelUp).toEqual({ from: hud(s).level, to: hud(s).level + 1 });
  });

  it("geofenced quests unlock only at the waypoint", () => {
    const s = createSession(NOW);
    const q3 = s.quests.find(e => e.quest.local_id === "q3")!.quest;
    const gate = questGate(s, q3);
    expect(gate.ok).toBe(false);
    expect(!gate.ok && en(gate.reason)).toMatch(/^Go to Iron Hall Gym/);
    const there = walkTo(s, gym).session;
    expect(questGate(there, q3)).toEqual({ ok: true });
  });

  it("walking reveals fog and counts toward the frontier exploration quest", () => {
    const s = createSession(NOW);
    const q4 = s.quests.find(e => e.quest.local_id === "q4")!.quest;
    expect(questGate(s, q4).ok).toBe(false);
    const east = walkTo(s, { lat: 40.9845, lng: 29.0420 });
    expect(east.revealed).toBeGreaterThan(0);
    const back = walkTo(east.session, { lat: 40.9875, lng: 29.0420 }).session;
    const inFrontier = [...back.newCells].filter(c => districtOf(c) === FRONTIER_DISTRICT).length;
    expect(questGate(back, q4).ok).toBe(inFrontier >= 15);
    expect(inFrontier).toBeGreaterThanOrEqual(15);
  });

  it("simulated fixes pass anti-spoofing at walking pace", () => {
    const s = createSession(NOW);
    const fixes = planWalk(s.position, gym);
    expect(fixes.length).toBeGreaterThanOrEqual(20);          // enough to arm the too_perfect check
    const { session, revealed } = walkTo(s, gym);
    expect(session.position.lat).toBeCloseTo(gym.lat, 6);
    expect(revealed).toBeGreaterThanOrEqual(0);
    expect(latLngToCell(session.position.lat, session.position.lng, FOG_RES)).toBe(latLngToCell(gym.lat, gym.lng, FOG_RES));
  });
});

describe("real GPS", () => {
  const cupertino = { lat: 37.3349, lng: -122.009, t: NOW + 5_000, accuracyM: 5 };

  it("a far-away first fix would be rejected as a teleport", () => {
    expect(applyFixes(createSession(NOW), [cupertino]).revealed).toBe(0);
  });

  it("spawning places the player there and reveals the ring around them", () => {
    const { session, revealed } = spawnAt(createSession(NOW), cupertino);
    expect(session.position).toEqual(cupertino);
    expect(revealed).toBe(7);
    // The next fix a few seconds later validates against the spawn point as normal.
    const next = applyFixes(session, [{ ...cupertino, lat: cupertino.lat + 0.0001, t: cupertino.t + 10_000 }]);
    expect(next.session.position.lat).toBeCloseTo(cupertino.lat + 0.0001, 6);
  });

  it("refuses a spoofed first fix", () => {
    const s = createSession(NOW);
    expect(spawnAt(s, { ...cupertino, isMock: true }).session).toBe(s);
  });
});

describe("projection", () => {
  it("round-trips and keeps meters roughly square", () => {
    const p = makeProjection({ lat: 40.9862, lng: 29.0262 }, 4, 200, 300);
    expect(p.toScreen(40.9862, 29.0262)).toEqual({ x: 200, y: 300 });
    const ll = p.toLatLng(321, 87);
    const back = p.toScreen(ll.lat, ll.lng);
    expect(back.x).toBeCloseTo(321, 6);
    expect(back.y).toBeCloseTo(87, 6);
    // 400 m north and 400 m east are both ~100 px at 4 m/px.
    expect(300 - p.toScreen(40.9862 + 400 / 111_320, 29.0262).y).toBeCloseTo(100, 0);
  });
});
