// Skill trees (pillar 1 §3 skill_nodes). One tree per skill, same shape for all five:
//
//                 root (lv 1)            the class starting node; free for your class, 1 point for the others
//        ┌─────────┼─────────┐
//     Mastery     Path      Renown       three branches, tiers at skill level 3, 6 and 10
//     xp+3%      focus      title
//     xp+4%      xp+3%      xp+2%
//     xp+5%      title      title
//        └─────────┼─────────┘
//            capstone (lv 15)            xp+5% and a title, 2 points, needs one tier-3 node
//
// Points = skill level, spent only in that skill's tree (pillar 1 §7). Effects are deliberately small: a maxed tree
// is +27% XP in one skill, reached around skill level 15 (≈8k skill XP), and nothing changes another skill's XP.
import { CLASSES } from "../../../src/onboarding/calibration";
import { skillLevels, type SkillCode } from "../../../src/xp/xp-engine";
import type { Player } from "./session";
import { msg, ph, type Msg } from "../i18n";

// Not imported from ./session: that module imports this one, and the trees are built at load time.
const SKILLS: readonly SkillCode[] = ["vitality", "craft", "wealth", "charisma", "mindset"];

export type Effect = { xp: number } | { focus: true } | { title: string };

export interface SkillNode {
  id: string;
  skill: SkillCode;
  name: string;
  description: Msg;
  branch: "root" | "mastery" | "path" | "renown" | "capstone";
  tier: 0 | 1 | 2 | 3 | 4;
  requiredLevel: number;
  cost: number;
  parent: string | null;             // must be unlocked first; the capstone instead needs any tier-3 node
  effects: Effect[];
}

const TIER_LEVEL = [1, 3, 6, 10, 15] as const;

/** Names per skill: root, mastery 1-3, path 1-3, renown 1-3, capstone. Titles are the renown and capstone names. */
const NAMES: Record<SkillCode, { root: string; mastery: string[]; path: string[]; renown: string[]; capstone: string; focus: string }> = {
  vitality: {
    root: "Warrior's Resolve", mastery: ["Iron Lungs", "Second Wind", "Unbreakable"],
    path: ["Trail Seeker", "Early Riser", "Marathoner"], renown: ["the Hale", "the Tireless", "Ironheart"],
    capstone: "Titan", focus: "body and movement",
  },
  craft: {
    root: "Maker's Hands", mastery: ["Steady Focus", "Deep Work", "Flow State"],
    path: ["Apprentice's Bench", "Late Lamp", "Masterwork"], renown: ["the Tinkerer", "the Artificer", "Forgemaster"],
    capstone: "Grand Artisan", focus: "making and learning",
  },
  wealth: {
    root: "Ledger Sense", mastery: ["Thrift", "Compound Interest", "Golden Touch"],
    path: ["Coin Counter", "Budget Keeper", "Treasurer"], renown: ["the Frugal", "the Prosperous", "Goldwarden"],
    capstone: "Merchant Prince", focus: "money and work",
  },
  charisma: {
    root: "Silver Tongue", mastery: ["Warm Welcome", "Kindred Spirit", "Beloved"],
    path: ["Open Door", "Storyteller", "Guildheart"], renown: ["the Friendly", "the Trusted", "Voice of the Hall"],
    capstone: "Legend of the Tavern", focus: "people and connection",
  },
  mindset: {
    root: "Still Mind", mastery: ["Clear Head", "Quiet Hour", "Inner Citadel"],
    path: ["Reader's Lamp", "Journal Keeper", "Sage's Path"], renown: ["the Calm", "the Wise", "Keeper of Lore"],
    capstone: "Enlightened", focus: "mind and habits",
  },
};

const MASTERY_XP = [0.03, 0.04, 0.05];
export const ROOT_XP = 0.05;          // the class bonus from pillar 4 §2 B, now just this node
const CAPSTONE_XP = 0.05;

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function build(skill: SkillCode): SkillNode[] {
  const n = NAMES[skill];
  const pct = (x: number) => msg("node.desc.xp", { pct: Math.round(x * 100), skill: msg(`skill.${skill}`) });
  const root: SkillNode = {
    id: Object.values(CLASSES).find(c => c.skill === skill)!.startingNode, skill, name: n.root, branch: "root", tier: 0,
    requiredLevel: TIER_LEVEL[0], cost: 1, parent: null, effects: [{ xp: ROOT_XP }], description: pct(ROOT_XP),
  };
  const nodes: SkillNode[] = [root];
  const chain = (branch: "mastery" | "path" | "renown", names: string[], effects: Effect[][], describe: Msg[]) => {
    let parent = root.id;
    names.forEach((name, i) => {
      const id = `${skill}.${slug(name)}`;
      nodes.push({
        id, skill, name, branch, tier: (i + 1) as 1 | 2 | 3, requiredLevel: TIER_LEVEL[i + 1], cost: 1, parent,
        effects: effects[i], description: describe[i],
      });
      parent = id;
    });
  };
  chain("mastery", n.mastery, MASTERY_XP.map(x => [{ xp: x }]), MASTERY_XP.map(pct));
  chain("path", n.path,
    [[{ focus: true }], [{ xp: 0.03 }], [{ title: n.path[2] }]],
    [msg("node.desc.focus", { area: ph(n.focus) }), pct(0.03), msg("node.desc.title", { title: ph(n.path[2]) })]);
  chain("renown", n.renown,
    [[{ title: n.renown[0] }], [{ xp: 0.02 }], [{ title: n.renown[2] }]],
    [msg("node.desc.title", { title: ph(n.renown[0]) }), pct(0.02), msg("node.desc.title", { title: ph(n.renown[2]) })]);
  nodes.push({
    id: `${skill}.${slug(n.capstone)}`, skill, name: n.capstone, branch: "capstone", tier: 4, requiredLevel: TIER_LEVEL[4],
    cost: 2, parent: null, effects: [{ xp: CAPSTONE_XP }, { title: n.capstone }],
    description: msg("node.desc.capstone", { xp: pct(CAPSTONE_XP), title: ph(n.capstone) }),
  });
  return nodes;
}

export const TREES: Record<SkillCode, SkillNode[]> = Object.fromEntries(SKILLS.map(s => [s, build(s)])) as Record<SkillCode, SkillNode[]>;
/** A node's name as a translatable phrase. */
export const nodeName = (id: string) => ph(NODES.get(id)?.name ?? id);

export const NODES: ReadonlyMap<string, SkillNode> = new Map(SKILLS.flatMap(s => TREES[s]).map(n => [n.id, n]));

/** Unlocked nodes: the ones bought, plus the class root, which every character starts with for free. */
export function unlocked(p: Player): ReadonlySet<string> {
  const set = new Set(p.nodes ?? []);
  if (p.profile) set.add(p.profile.classNode);
  return set;
}

const isFree = (p: Player, n: SkillNode) => n.id === p.profile?.classNode;

/** Points in a skill: one per skill level, minus what that tree's bought nodes cost. */
export function points(p: Player, skill: SkillCode): { total: number; spent: number; free: number } {
  const total = skillLevels.levelFor(p.skills[skill].xp);
  const owned = unlocked(p);
  const spent = TREES[skill].filter(n => owned.has(n.id) && !isFree(p, n)).reduce((a, n) => a + n.cost, 0);
  return { total, spent, free: total - spent };
}

export type NodeState = "owned" | "available" | "locked";
export type Check = { ok: true } | { ok: false; reason: Msg };

export function canUnlock(p: Player, id: string): Check {
  const n = NODES.get(id);
  if (!n) return { ok: false, reason: msg("node.unknown") };
  const owned = unlocked(p);
  if (owned.has(id)) return { ok: false, reason: msg("node.owned") };
  if (n.parent && !owned.has(n.parent)) return { ok: false, reason: msg("node.needs", { node: nodeName(n.parent) }) };
  if (n.branch === "capstone" && !TREES[n.skill].some(m => m.tier === 3 && owned.has(m.id))) {
    return { ok: false, reason: msg("node.needsTier3") };
  }
  const level = skillLevels.levelFor(p.skills[n.skill].xp);
  if (level < n.requiredLevel) return { ok: false, reason: msg("node.reach", { skill: msg(`skill.${n.skill}`), level: n.requiredLevel }) };
  if (points(p, n.skill).free < n.cost) return { ok: false, reason: n.cost > 1 ? msg("node.needsPoints", { n: n.cost }) : msg("node.noPoints") };
  return { ok: true };
}

export function nodeState(p: Player, id: string): NodeState {
  return unlocked(p).has(id) ? "owned" : canUnlock(p, id).ok ? "available" : "locked";
}

export function unlockNode(p: Player, id: string): { ok: true; player: Player } | { ok: false; reason: Msg } {
  const c = canUnlock(p, id);
  if (!c.ok) return c;
  return { ok: true, player: { ...p, nodes: [...(p.nodes ?? []), id] } };
}

/** Summed XP bonus per skill from unlocked nodes, as a fraction (0.05 = +5%). */
export function xpBonus(p: Player): Partial<Record<SkillCode, number>> {
  const out: Partial<Record<SkillCode, number>> = {};
  for (const id of unlocked(p)) {
    const n = NODES.get(id);
    if (!n) continue;
    for (const e of n.effects) if ("xp" in e) out[n.skill] = (out[n.skill] ?? 0) + e.xp;
  }
  return out;
}

/** Skills whose Path node makes daily quests lean their way. */
export function focusSkills(p: Player): SkillCode[] {
  return [...unlocked(p)].flatMap(id => {
    const n = NODES.get(id);
    return n && n.effects.some(e => "focus" in e) ? [n.skill] : [];
  });
}

/** Titles the player can wear, in tree order. */
export function titles(p: Player): string[] {
  const owned = unlocked(p);
  return SKILLS.flatMap(s => TREES[s]).filter(n => owned.has(n.id))
    .flatMap(n => n.effects.flatMap(e => ("title" in e ? [e.title] : [])));
}

/** Nodes that could be bought right now, across all trees: drives the "points to spend" dot on the HUD. */
export function availableCount(p: Player): number {
  return SKILLS.reduce((a, s) => a + TREES[s].filter(n => canUnlock(p, n.id).ok).length, 0);
}
