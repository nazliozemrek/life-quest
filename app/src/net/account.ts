// Account backup and restore. Every player starts anonymous; backing up attaches an email to that same account
// (so nothing moves), and restoring on another phone signs in with a 6-digit code sent to that email.
// These talk to Supabase and return a Msg on failure; what the save holds is in game/cloudsave.ts.
import { msg, type Msg } from "../i18n";
import type { SavedGame } from "../game/persist";
import { supabase } from "./supabase";

type Result = { ok: true } | { ok: false; error: Msg };
const fail = (e: unknown): Result => {
  const m = String((e as { message?: string })?.message ?? e ?? "");
  if (/rate|too many|security purposes/i.test(m)) return { ok: false, error: msg("account.err.rate") };
  if (/expired|invalid|token/i.test(m)) return { ok: false, error: msg("account.err.code") };
  if (/already (been )?registered|already exists/i.test(m)) return { ok: false, error: msg("account.err.taken") };
  if (/signups not allowed|not found/i.test(m)) return { ok: false, error: msg("account.err.noAccount") };
  return { ok: false, error: msg("account.err.network") };
};
const offline: Result = { ok: false, error: msg("account.err.offline") };

/** The email this account is backed up with, once confirmed. */
export async function backedUpEmail(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  return u && !u.is_anonymous && u.email ? u.email : null;
}

/** Step 1 of backup: attach an email to the current (anonymous) account. Supabase emails a code. */
export async function startBackup(email: string): Promise<Result> {
  if (!supabase) return offline;
  const { error } = await supabase.auth.updateUser({ email: email.trim() });
  return error ? fail(error) : { ok: true };
}

export async function confirmBackup(email: string, code: string): Promise<Result> {
  if (!supabase) return offline;
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email_change" });
  return error ? fail(error) : { ok: true };
}

/** Step 1 of restore: a code to an email that already has a backed-up account. Never creates an account. */
export async function startRestore(email: string): Promise<Result> {
  if (!supabase) return offline;
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
  return error ? fail(error) : { ok: true };
}

/** Step 2 of restore: sign in, then download the save and the fog. */
export async function confirmRestore(email: string, code: string): Promise<
  { ok: true; save: SavedGame; cells: string[] } | { ok: false; error: Msg }
> {
  if (!supabase) return offline as { ok: false; error: Msg };
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
  if (error) return fail(error) as { ok: false; error: Msg };
  const save = await supabase.from("player_saves").select("save").maybeSingle();
  if (save.error) return fail(save.error) as { ok: false; error: Msg };
  if (!save.data) return { ok: false, error: msg("account.err.noSave") };
  const cells: string[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await supabase.from("player_explored_cells").select("cell").range(from, from + 999);
    if (page.error) return fail(page.error) as { ok: false; error: Msg };
    cells.push(...page.data.map(r => r.cell as string));
    if (page.data.length < 1000) break;
  }
  return { ok: true, save: save.data.save as SavedGame, cells };
}
