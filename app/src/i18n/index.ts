// Turkish and English. Every string the player reads goes through t(key, params); `{name}` placeholders are filled
// from params. Game logic never builds English text: it returns a Msg (key + params) and the screen translates it.
// Content written as English data (skill node names, goal suggestions, titles) is a "phrase": shown as is in
// English and looked up in PHRASES_TR in Turkish, falling back to the English when there's no entry.
import { en } from "./en";
import { PHRASES_TR } from "./phrases.tr";
import { tr } from "./tr";

export type Lang = "en" | "tr";
export type Key = keyof typeof en;
/** A message to translate later. Params may nest messages and phrases. */
export interface Msg { key: Key; params?: Params }
export interface Phrase { phrase: string }
export type Params = Record<string, string | number | Msg | Phrase>;
export type T = ((key: Key, params?: Params) => string) & { lang: Lang; p(english: string): string };

const DICTS: Record<Lang, Record<Key, string>> = { en, tr };

export function phrase(lang: Lang, english: string): string {
  return lang === "tr" ? PHRASES_TR[english] ?? english : english;
}

export function translate(lang: Lang, key: Key, params?: Params): string {
  const s = DICTS[lang][key] ?? en[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    if (v === undefined) return m;
    if (typeof v !== "object") return String(v);
    return "phrase" in v ? phrase(lang, v.phrase) : translate(lang, v.key, v.params);
  });
}

export const msg = (key: Key, params?: Params): Msg => ({ key, params });
export const ph = (english: string): Phrase => ({ phrase: english });

export function makeT(lang: Lang): T {
  const t = ((key: Key, params?: Params) => translate(lang, key, params)) as T;
  t.lang = lang;
  t.p = english => phrase(lang, english);
  return t;
}

/** Translate a Msg with a T. */
export const say = (t: T, m: Msg): string => t(m.key, m.params);

/** "1 quest" / "3 quests": English needs the plural, Turkish never inflects after a number. */
export function plural(t: T, n: number, one: Key, many: Key): string {
  return t(n === 1 ? one : many, { n });
}
