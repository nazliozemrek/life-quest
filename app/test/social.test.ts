import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSession } from "../src/game/mock-world";
import {
  FEED_NODES, avatarPixels, creditRespect, feedLine, parseFeed, regionOf, suggestUsername, timeAgo, titleNodeId,
  titleOf, unseen, badgeText, usernameProblem,
} from "../src/game/social";
import { translate } from "../src/i18n";

const NOW = Date.UTC(2026, 9, 6, 9, 0);
const migration = readFileSync(new URL("../../supabase/migrations/20261006090000_social.sql", import.meta.url), "utf8");

describe("privacy", () => {
  it("sends a resolution-5 region only, the shape the server accepts", () => {
    const r = regionOf({ lat: 41.0369, lng: 28.985 });
    expect(r).toMatch(/^85[0-9a-f]{13}$/);
  });

  it("refuses the character name as a username", () => {
    expect(usernameProblem("kaan", "Kaan")?.key).toBe("social.err.isHandle");
    expect(usernameProblem("ayse_yilmaz", "Ayse Yilmaz")?.key).toBe("social.err.isHandle");
    expect(usernameProblem("Iron Wolf", "Kaan")?.key).toBe("social.err.username");
    expect(usernameProblem("ironwolf", "Kaan")).toBeNull();
  });

  it("suggests usernames that pass the rules", () => {
    for (let s = 0; s < 50; s++) expect(usernameProblem(suggestUsername(s * 977), "Kaan")).toBeNull();
  });
});

describe("feed", () => {
  it("only big nodes make cards, the same list the database uses", () => {
    expect(FEED_NODES).toHaveLength(20);
    for (const id of FEED_NODES) expect(migration).toContain(`'${id}'`);
    expect(FEED_NODES).toContain("mindset.sage_s_path");
    expect(FEED_NODES).not.toContain("vitality.iron_lungs");
  });

  it("joins kind and event, and drops kinds this build doesn't know", () => {
    const page = parseFeed({ scope: "peers", items: [
      { id: "3", kind: "level_up", event: { level: 12 }, respectCount: 2, respectedByMe: false, mine: false, createdAt: "", author: {} },
      { id: "2", kind: "future_thing", event: {}, respectCount: 0, respectedByMe: false, mine: false, createdAt: "", author: {} },
    ] });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].event).toEqual({ kind: "level_up", level: 12 });
  });

  it("writes every card in both languages", () => {
    const events = [
      { kind: "level_up", level: 10 }, { kind: "skill_node", nodeId: "vitality.titan" },
      { kind: "skill_node", nodeId: "craft.masterwork" }, { kind: "district", pct: 50 }, { kind: "district", pct: 75 },
    ] as const;
    for (const e of events) {
      const m = feedLine(e);
      for (const lang of ["en", "tr"] as const) expect(translate(lang, m.key, m.params)).not.toMatch(/\{|social\./);
    }
    const capstone = feedLine({ kind: "skill_node", nodeId: "vitality.titan" });
    expect(translate("en", capstone.key, capstone.params)).toBe("Mastered a tree: Titan");
  });

  it("rounds time to the hour like the server", () => {
    expect(timeAgo(new Date(NOW - 20 * 60_000).toISOString(), NOW).key).toBe("social.ago.hour");
    expect(timeAgo(new Date(NOW - 3 * 3_600_000).toISOString(), NOW).params).toEqual({ n: 3 });
    expect(timeAgo(new Date(NOW - 50 * 3_600_000).toISOString(), NOW).key).toBe("social.ago.days");
  });

  it("stores titles by the node that grants them", () => {
    expect(titleNodeId("Ironheart")).toBe("vitality.ironheart");
    expect(titleOf("vitality.ironheart")).toEqual({ phrase: "Ironheart" });
    expect(titleNodeId(undefined)).toBeNull();
  });
});

describe("avatars", () => {
  it("draws the same mirrored sprite from the same seed", () => {
    const a = avatarPixels(1234);
    expect(avatarPixels(1234)).toEqual(a);
    expect(avatarPixels(1235)).not.toEqual(a);
    for (const row of a) expect(row).toEqual([...row].reverse());
  });
});

describe("respect", () => {
  it("credits rested XP once per inbox id", () => {
    const p = createSession(NOW).player;
    const once = creditRespect(p, { lastId: 7, count: 3, restedXp: 15 });
    expect(once.rested).toBe(p.rested + 15);
    expect(creditRespect(once, { lastId: 7, count: 3, restedXp: 15 })).toBe(once);
  });
});

describe("red dot", () => {
  it("counts only others' cards newer than the last look", () => {
    const item = (id: string, mine = false) => ({ id, mine } as Parameters<typeof unseen>[0][number]);
    const u = unseen([item("9"), item("8", true), item("7"), item("5")], 6);
    expect(u.count).toBe(2);
    expect(u.peek?.id).toBe("9");
    expect(badgeText(12)).toBe("9+");
  });
});
