// Around You and Respect: the parts that don't touch the network or the screen. The server
// (supabase/migrations/20261006090000_social.sql) decides what other players see; this turns its answers into
// things to show, and keeps the privacy rules on the phone side: only an H3 resolution-5 region ever leaves it.
import { latLngToCell } from "h3-js";
import type { DifficultyMode, SkillCode } from "../../../src/xp/xp-engine";
import { msg, ph, type Msg } from "../i18n";
import type { Player } from "./session";
import { NODES, TREES } from "./skilltree";

/** H3 resolution 5, about 250 km²: a metro area. The finest location social features ever send. */
export const REGION_RES = 5;
export const regionOf = (p: { lat: number; lng: number }) => latLngToCell(p.lat, p.lng, REGION_RES);

export interface Avatar { style: "pixel"; seed: number; palette: number }

export interface PublicAuthor {
  username: string;
  avatar: Avatar;
  level: number;
  classCode: string | null;
  titleId: string | null;
  mode: DifficultyMode | null;      // null unless the author chose to show it
}

export type FeedEvent =
  | { kind: "level_up"; level: number }
  | { kind: "skill_node"; nodeId: string }
  | { kind: "district"; pct: number }
  | { kind: "main_quest"; skill: SkillCode; horizon: string }
  | { kind: "streak"; days: number };

export interface FeedItem {
  id: string;
  author: PublicAuthor;
  event: FeedEvent;
  respectCount: number;
  respectedByMe: boolean;
  mine: boolean;
  createdAt: string;
}

export type FeedScope = "nearby" | "peers" | "private";
export interface FeedPage { scope: FeedScope; items: FeedItem[] }

/** The server sends kind and event apart; joined here, dropping kinds this build doesn't know. */
export function parseFeed(raw: unknown): FeedPage {
  const r = raw as { scope?: FeedScope; items?: (Omit<FeedItem, "event"> & { kind: string; event: object })[] } | null;
  const known = new Set(["level_up", "skill_node", "district"]);
  return {
    scope: r?.scope ?? "private",
    items: (r?.items ?? []).filter(i => known.has(i.kind)).map(({ kind, event, ...rest }) => ({
      ...rest, event: { kind, ...event } as FeedEvent,
    })),
  };
}

// ---------- Usernames ----------

export const USERNAME = /^[a-z0-9_]{3,20}$/;

/** Why a username can't be used, or null. The server checks the same rules and uniqueness. */
export function usernameProblem(name: string, characterName: string): Msg | null {
  const n = name.trim().toLowerCase();
  if (!USERNAME.test(n)) return msg("social.err.username");
  const handle = characterName.trim().toLowerCase().replace(/\s+/g, "_");
  if (n === handle || n === characterName.trim().toLowerCase()) return msg("social.err.isHandle");
  return null;
}

const ADJ = ["swift", "iron", "quiet", "bold", "lucky", "ember", "frost", "wild", "steady", "bright", "silver", "night"];
const NOUN = ["wolf", "fox", "hawk", "bear", "owl", "lynx", "stag", "raven", "otter", "falcon", "badger", "heron"];

/** A username made from a seed, so the suggestion is never the player's name. */
export function suggestUsername(seed: number): string {
  const r = rng(seed);
  return `${ADJ[Math.floor(r() * ADJ.length)]}${NOUN[Math.floor(r() * NOUN.length)]}${Math.floor(r() * 90 + 10)}`;
}

// ---------- Avatars ----------

/** Twelve palettes: body colour and a lighter accent, readable on the dark HUD. */
export const PALETTES: readonly [string, string][] = [
  ["#F5C451", "#FFE7A3"], ["#F2555A", "#FFA3A6"], ["#3DD68C", "#A6F0CC"], ["#4CC3FF", "#B3E6FF"],
  ["#8B7CF6", "#C9C0FF"], ["#E05BB0", "#F5B3DC"], ["#F5A524", "#FFD699"], ["#2EC4B6", "#A3EDE6"],
  ["#FF7A45", "#FFC2A6"], ["#9BE15D", "#D4F5B3"], ["#C0CAD8", "#EEF1F6"], ["#D4A373", "#F0D9C2"],
];

/** An 8x8 sprite, mirrored left to right like a space invader: 0 empty, 1 body, 2 accent. Same seed, same face. */
export function avatarPixels(seed: number): number[][] {
  const r = rng(seed);
  const rows: number[][] = [];
  for (let y = 0; y < 8; y++) {
    const half = Array.from({ length: 4 }, (_, x) => {
      const edge = x === 0 ? 0.35 : 0.6;                // fewer pixels on the outer columns, so it reads as a shape
      if (r() > edge) return 0;
      return r() < 0.22 ? 2 : 1;
    });
    rows.push([...half, ...[...half].reverse()]);
  }
  rows[3][2] = rows[3][5] = 0;                          // eyes
  rows[3][1] = rows[3][6] = 1;
  return rows;
}

export const randomAvatar = (seed: number): Avatar => ({ style: "pixel", seed: seed >>> 0 & 0x7fffffff, palette: (seed >>> 3) % 12 });

// ---------- Titles and the feed ----------

/** Nodes big enough to make a card: each tree's three tier-3 nodes and its capstone. Mirrored in the migration. */
export const FEED_NODES: readonly string[] = Object.values(TREES).flat()
  .filter(n => n.tier >= 3).map(n => n.id);

/** The node that grants a worn title (titles are stored by node id, so the server can check they were earned). */
export function titleNodeId(title: string | undefined): string | null {
  if (!title) return null;
  for (const n of NODES.values()) if (n.effects.some(e => "title" in e && e.title === title)) return n.id;
  return null;
}

/** The title a node grants, as a phrase. */
export function titleOf(nodeId: string | null) {
  const n = nodeId ? NODES.get(nodeId) : undefined;
  const e = n?.effects.find(x => "title" in x) as { title: string } | undefined;
  return e ? ph(e.title) : null;
}

/** The card's one line. */
export function feedLine(e: FeedEvent): Msg {
  switch (e.kind) {
    case "level_up": return msg("social.ev.level", { n: e.level });
    case "skill_node": {
      const n = NODES.get(e.nodeId);
      return n?.branch === "capstone"
        ? msg("social.ev.capstone", { node: ph(n.name) })
        : msg("social.ev.node", { node: ph(n?.name ?? e.nodeId) });
    }
    case "district": return e.pct >= 75 ? msg("social.ev.legend") : msg("social.ev.district", { pct: e.pct });
    case "main_quest": return msg("social.ev.mainQuest", { skill: msg(`skill.${e.skill}`) });
    case "streak": return msg("social.ev.streak", { n: e.days });
  }
}

/** The skill a card belongs to, for its icon colour. */
export function feedSkill(e: FeedEvent): SkillCode | null {
  if (e.kind === "skill_node") return NODES.get(e.nodeId)?.skill ?? null;
  if (e.kind === "main_quest") return e.skill;
  return null;
}

/** Capstones and every tenth level get the gold border. */
export const isBig = (e: FeedEvent) =>
  (e.kind === "skill_node" && NODES.get(e.nodeId)?.branch === "capstone") || (e.kind === "level_up" && e.level % 10 === 0)
  || (e.kind === "district" && e.pct >= 75);

/** "2 h ago". Server times are rounded down to the hour, so anything under an hour is "this hour". */
export function timeAgo(iso: string, now: number): Msg {
  const h = Math.max(0, Math.floor((now - Date.parse(iso)) / 3_600_000));
  if (h < 1) return msg("social.ago.hour");
  if (h < 24) return msg("social.ago.hours", { n: h });
  return msg("social.ago.days", { n: Math.floor(h / 24) });
}

// ---------- Respect ----------

export type RespectRefusal = "daily_cap" | "slow_down" | "expired" | "not_found" | "private" | "offline";
export type GiveResult = { ok: true; restedGranted: number } | { ok: false; reason: RespectRefusal };

export interface Inbox { lastId: number; count: number; restedXp: number }

/** Respect received since the last check: its rested XP joins the pool, and the id moves on so it's never paid twice. */
export function creditRespect(p: Player, inbox: Inbox): Player {
  if (inbox.lastId <= (p.respectSeen ?? 0)) return p;
  return { ...p, rested: p.rested + inbox.restedXp, respectSeen: inbox.lastId };
}

// mulberry32: small, fast, and the same on every phone.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- The red dot ----------

/** Cards from others that arrived since the player last opened Around You, and the newest one as a teaser. */
export function unseen(items: FeedItem[], lastSeen: number): { count: number; peek: FeedItem | null } {
  const fresh = items.filter(i => !i.mine && Number(i.id) > lastSeen);
  return { count: fresh.length, peek: fresh[0] ?? null };
}

/** "3", or "9+" when the dot would get crowded. */
export const badgeText = (n: number) => (n > 9 ? "9+" : String(n));
