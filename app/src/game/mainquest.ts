// Finishing a main quest (a goal from setup.ts): the biggest single payout in the game, paid once per goal.
// It's on the honour system, so each horizon waits a few days after the goal was picked before it can be claimed,
// which keeps "pick a year goal, finish it right away" from being a free level.
import { playerLevels, type SkillCode } from "../../../src/xp/xp-engine";
import { msg, type Msg } from "../i18n";
import { SKILLS, type Session } from "./session";
import type { Goal, Horizon } from "./setup";

/** XP for finishing: a week goal is worth a few days of quests, a year goal about a level and a half mid-game. */
export const MAIN_QUEST_XP: Record<Horizon, number> = { week: 150, month: 400, year: 1200 };
/** Days after picking a goal before it can be claimed. */
export const MIN_DAYS: Record<Horizon, number> = { week: 3, month: 10, year: 45 };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Why this goal can't be finished today, or null. */
export function finishBlocker(g: Goal, today: string): Msg | null {
  if (g.doneAt) return msg("goal.done");
  const left = MIN_DAYS[g.horizon] - (g.createdAt ? daysBetween(g.createdAt, today) : 0);
  return left > 0 ? msg(left === 1 ? "goal.tooSoonOne" : "goal.tooSoon", { n: left }) : null;
}

/** XP per skill: all of it to the goal's skill, or spread evenly when the goal has none. */
export function goalSplit(g: Goal): Partial<Record<SkillCode, number>> {
  const xp = MAIN_QUEST_XP[g.horizon];
  if (g.skill) return { [g.skill]: xp };
  const each = Math.floor(xp / SKILLS.length);
  return Object.fromEntries(SKILLS.map((s, i) => [s, i === 0 ? xp - each * (SKILLS.length - 1) : each]));
}

export type FinishResult =
  | { ok: true; session: Session; goal: Goal; xp: number; split: Partial<Record<SkillCode, number>>; levelUp: number | null }
  | { ok: false; reason: Msg };

export function finishGoal(s: Session, id: string, today: string): FinishResult {
  const profile = s.player.profile;
  const goal = profile?.goals?.find(g => g.id === id);
  if (!profile || !goal) return { ok: false, reason: msg("goal.missing") };
  const blocked = finishBlocker(goal, today);
  if (blocked) return { ok: false, reason: blocked };

  const xp = MAIN_QUEST_XP[goal.horizon];
  const split = goalSplit(goal);
  const skills = { ...s.player.skills };
  for (const [code, add] of Object.entries(split) as [SkillCode, number][]) {
    skills[code] = { ...skills[code], xp: skills[code].xp + add, idleDays: 0, earnedToday: skills[code].earnedToday + add };
  }
  const from = playerLevels.levelFor(s.player.totalXp);
  const totalXp = s.player.totalXp + xp;
  const to = playerLevels.levelFor(totalXp);
  const done = { ...goal, doneAt: today };
  return {
    ok: true, goal: done, xp, split, levelUp: to > from ? to : null,
    session: {
      ...s,
      player: { ...s.player, totalXp, skills, profile: { ...profile, goals: profile.goals!.map(g => (g.id === id ? done : g)) } },
    },
  };
}
