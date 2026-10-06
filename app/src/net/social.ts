// Around You and Respect over Supabase. Every call is a database function (see the social migration), so the
// server enforces the privacy rules and the Respect limits; nothing here can read another player's rows.
import { parseFeed, type Avatar, type FeedPage, type GiveResult, type Inbox, type RespectRefusal } from "../game/social";
import { msg, type Msg } from "../i18n";
import { ensureSignedIn, supabase } from "./supabase";

export interface MyProfile {
  username: string;
  avatar: Avatar;
  titleId: string | null;
  showMode: boolean;
  visible: boolean;
  region: string | null;
  regionAt: string | null;
}

/** My public profile, or null when I've never gone public. Undefined when offline. */
export async function myProfile(): Promise<MyProfile | null | undefined> {
  if (!supabase || !(await ensureSignedIn())) return undefined;
  const { data, error } = await supabase.from("public_profiles")
    .select("username, avatar, title_id, show_mode, visible, region, region_at").maybeSingle();
  if (error) return undefined;
  if (!data) return null;
  return {
    username: data.username, avatar: data.avatar as Avatar, titleId: data.title_id, showMode: data.show_mode,
    visible: data.visible, region: data.region, regionAt: data.region_at,
  };
}

const REASONS: Record<string, Msg> = {
  username: msg("social.err.username"),
  reserved: msg("social.err.reserved"),
  is_handle: msg("social.err.isHandle"),
  taken: msg("social.err.taken"),
  no_player: msg("social.err.noPlayer"),
  avatar: msg("social.err.avatar"),
};

export async function saveProfile(p: Omit<MyProfile, "region" | "regionAt">): Promise<{ ok: true } | { ok: false; error: Msg }> {
  if (!supabase || !(await ensureSignedIn())) return { ok: false, error: msg("account.err.offline") };
  const { data, error } = await supabase.rpc("set_public_profile", {
    p_username: p.username, p_avatar: p.avatar, p_title_id: p.titleId, p_show_mode: p.showMode, p_visible: p.visible,
  });
  if (error) return { ok: false, error: msg("account.err.network") };
  const r = data as { ok: boolean; reason?: string };
  return r.ok ? { ok: true } : { ok: false, error: REASONS[r.reason ?? ""] ?? msg("account.err.network") };
}

/** Send my region (H3 resolution 5 only: the server refuses anything finer). */
export async function saveRegion(cell: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("set_region", { p_cell: cell });
}

/** Newest first. `before` pages back; `after` asks only for what is new since the top item. */
export async function fetchFeed(opts: { before?: string; after?: string } = {}): Promise<FeedPage | null> {
  if (!supabase || !(await ensureSignedIn())) return null;
  const { data, error } = await supabase.rpc("feed_around_me", {
    p_before: opts.before ? Number(opts.before) : null, p_after: opts.after ? Number(opts.after) : null, p_limit: 30,
  });
  return error ? null : parseFeed(data);
}

export async function giveRespect(itemId: string): Promise<GiveResult> {
  if (!supabase) return { ok: false, reason: "offline" };
  const { data, error } = await supabase.rpc("give_respect", { p_item: Number(itemId) });
  if (error) return { ok: false, reason: "offline" };
  const r = data as { ok: boolean; reason?: string; restedGranted?: number };
  return r.ok ? { ok: true, restedGranted: r.restedGranted ?? 0 } : { ok: false, reason: (r.reason ?? "not_found") as RespectRefusal };
}

/** Respect received after `after`. Never says who sent it. */
export async function fetchInbox(after: number): Promise<Inbox | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("respect_inbox", { p_after: after });
  if (error || !data) return null;
  const r = data as Inbox;
  return { lastId: Number(r.lastId), count: Number(r.count), restedXp: Number(r.restedXp) };
}

export type ReportReason = "name" | "avatar" | "cheating" | "other";

/** Report a card. Hides it for me; any reason but cheating also blocks its author. */
export async function reportItem(itemId: string, reason: ReportReason): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("report_item", { p_item: Number(itemId), p_reason: reason });
  return !error && (data as { ok: boolean }).ok;
}

/** Hide everything from this card's author, both ways. They aren't told. */
export async function blockAuthor(itemId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("block_author", { p_item: Number(itemId) });
  return !error && (data as { ok: boolean }).ok;
}

export async function blockedCount(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("blocked_count");
  return error ? 0 : Number(data);
}

export async function unblockAll(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("unblock_all");
  return !error;
}
