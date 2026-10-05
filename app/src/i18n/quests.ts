// Quest text in the player's language. Curated quests are translated (QUESTS_TR, keyed by pool id from
// Quest.rationale "pool:<id>", or by English title for the built-in ones); AI-written quests show as written.
import type { Quest } from "../../../src/quests/quest-generator";
import type { T } from "./index";
import { QUESTS_TR } from "./quests.tr";

export interface QuestText { title: string; flavor: string; objective: string }

export function questText(q: Pick<Quest, "title" | "flavor_text" | "objective" | "rationale">, t: T): QuestText {
  const en = { title: q.title, flavor: q.flavor_text, objective: q.objective };
  if (t.lang !== "tr") return en;
  const id = q.rationale?.startsWith("pool:") ? q.rationale.slice(5) : null;
  return (id && QUESTS_TR[id]) || QUESTS_TR[q.title] || en;
}
