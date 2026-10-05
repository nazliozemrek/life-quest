import { describe, expect, it } from "vitest";
import { POOL } from "../../src/quests/quest-pool";
import { en } from "../src/i18n/en";
import { tr } from "../src/i18n/tr";
import { makeT, msg, ph, translate } from "../src/i18n";
import { questText } from "../src/i18n/quests";
import { PHRASES_TR } from "../src/i18n/phrases.tr";
import { NODES } from "../src/game/skilltree";
import { GOAL_SUGGESTIONS } from "../src/game/setup";
import { toQuest } from "../../src/quests/quest-pool";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe("translations", () => {
  it("has every key in Turkish with the same placeholders", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(tr[k], k).toBeTruthy();
      expect(placeholders(tr[k]), k).toEqual(placeholders(en[k]));
    }
  });

  it("fills nested messages and phrases", () => {
    const m = msg("node.needs", { node: ph("Warm Welcome") });
    expect(translate("en", m.key, m.params)).toBe("Needs Warm Welcome");
    expect(translate("tr", m.key, m.params)).toBe("Önce: Sıcak Karşılama");
    expect(translate("tr", "node.reach", { skill: msg("skill.charisma"), level: 6 })).toBe("Karizma seviye 6 olmalı");
  });

  it("covers every skill node, goal suggestion and curated quest in Turkish", () => {
    for (const n of NODES.values()) expect(PHRASES_TR[n.name], n.name).toBeTruthy();
    for (const g of GOAL_SUGGESTIONS) expect(PHRASES_TR[g.title], g.title).toBeTruthy();
    const t = makeT("tr");
    for (const p of POOL) expect(questText(toQuest(p, "q1", 1), t).title, p.id).not.toBe(p.title);
    expect(questText(toQuest(POOL[0], "q1", 1), makeT("en")).title).toBe(POOL[0].title);
  });
});
