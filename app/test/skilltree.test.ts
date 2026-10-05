import { describe, expect, it } from "vitest";
import { CLASSES } from "../../src/onboarding/calibration";
import { skillLevels } from "../../src/xp/xp-engine";
import { MOCK_QUESTS, createSession } from "../src/game/mock-world";
import { SKIPPED, startGame } from "../src/game/onboarding";
import { poolQuests } from "../src/game/context";
import { previewAward, type Player, type Session } from "../src/game/session";
import { translate, type Msg } from "../src/i18n";
import { NODES, TREES, availableCount, canUnlock, focusSkills, points, titles, unlockNode, xpBonus } from "../src/game/skilltree";

const en = (m: Msg) => translate("en", m.key, m.params);
const NOW = Date.UTC(2026, 9, 5, 7, 0);
const bard = () => startGame(createSession(NOW), "Kaan", { ...SKIPPED, focusClass: "bard" }, NOW).session;

/** The player with a skill set to exactly the start of `level`. */
function atLevel(p: Player, skill: keyof Player["skills"], level: number): Player {
  return { ...p, skills: { ...p.skills, [skill]: { ...p.skills[skill], xp: skillLevels.xpToReach(level) } } };
}
function why(p: Player, id: string) {
  const c = canUnlock(p, id);
  return c.ok ? "ok" : en(c.reason);
}
function buy(p: Player, ...ids: string[]): Player {
  return ids.reduce((acc, id) => {
    const r = unlockNode(acc, id);
    if (!r.ok) throw new Error(`${id}: ${en(r.reason)}`);
    return r.player;
  }, p);
}

describe("skill trees", () => {
  it("has eleven nodes per skill, rooted at the class starting nodes", () => {
    for (const [skill, nodes] of Object.entries(TREES)) {
      expect(nodes).toHaveLength(11);
      expect(nodes[0].id).toBe(Object.values(CLASSES).find(c => c.skill === skill)!.startingNode);
    }
    expect(NODES.size).toBe(55);
    for (const n of NODES.values()) expect(n.id).toMatch(/^(vitality|craft|wealth|charisma|mindset)\.[a-z0-9_]{1,40}$/);
  });

  it("gives the class root free and one point per skill level", () => {
    const p = atLevel(bard().player, "charisma", 4);
    expect(points(p, "charisma")).toEqual({ total: 4, spent: 0, free: 4 });
    expect(xpBonus(p)).toEqual({ charisma: 0.05 });
    expect(titles(p)).toEqual([]);
  });

  it("enforces level, parent, points and the capstone rule", () => {
    let p = atLevel(bard().player, "charisma", 3);
    expect(why(p, "charisma.kindred_spirit")).toBe("Needs Warm Welcome");
    expect(why(p, "vitality.iron_lungs")).toBe("Needs Warrior's Resolve");
    p = buy(p, "charisma.warm_welcome", "charisma.open_door", "charisma.the_friendly");
    expect(why(p, "charisma.kindred_spirit")).toBe("Reach Charisma level 6");
    expect(points(p, "charisma").free).toBe(0);

    p = atLevel(p, "charisma", 15);
    expect(why(p, "charisma.legend_of_the_tavern")).toBe("Needs a tier 3 node");
    p = buy(p, "charisma.kindred_spirit", "charisma.beloved", "charisma.legend_of_the_tavern");
    expect(points(p, "charisma")).toEqual({ total: 15, spent: 7, free: 8 });
    expect(xpBonus(p).charisma).toBeCloseTo(0.05 + 0.03 + 0.04 + 0.05 + 0.05);
    expect(titles(p)).toEqual(["the Friendly", "Legend of the Tavern"]);
  });

  it("costs a point for another class's root", () => {
    const p = atLevel(bard().player, "vitality", 1);
    expect(availableCount(p)).toBeGreaterThan(0);
    const after = buy(p, "vitality.warriors_resolve");
    expect(points(after, "vitality")).toEqual({ total: 1, spent: 1, free: 0 });
    expect(xpBonus(after).vitality).toBeCloseTo(0.05);
  });

  it("pays tree bonuses only on the skill's share of a quest", () => {
    const s = bard();
    const q = { ...MOCK_QUESTS[0], skill_weights: [{ skill: "charisma" as const, weight: 0.6 }, { skill: "craft" as const, weight: 0.4 }] };
    const base = previewAward({ ...s, player: { ...s.player, profile: undefined } } as Session, q);
    const withRoot = previewAward(s, q);
    expect(withRoot.perSkill.charisma).toBe(base.perSkill.charisma! + Math.floor(base.perSkill.charisma! * 0.05));
    for (const k of Object.keys(base.perSkill)) if (k !== "charisma") expect(withRoot.perSkill[k as "craft"]).toBe(base.perSkill[k as "craft"]);
  });

  it("makes daily quests lean toward a Path skill", () => {
    const s = bard();
    const p = buy(atLevel(s.player, "wealth", 3), "wealth.ledger_sense", "wealth.coin_counter");
    expect(focusSkills(p)).toEqual(["wealth"]);
    const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    const lead = days.map(d => poolQuests({ ...s, player: p }, d)[0].quest);
    expect(lead.every(q => q.skill_weights[0].skill === "wealth")).toBe(true);
  });
});
