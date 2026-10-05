import type { SkillCode } from "../../../src/xp/xp-engine";

export const color = {
  bg: "#0B0E14",
  panel: "rgba(16, 20, 30, 0.94)",
  panelBorder: "rgba(255, 255, 255, 0.08)",
  text: "#E8EAF0",
  textDim: "#8A93A6",
  textFaint: "#566075",
  xp: "#F5C451",
  rested: "rgba(110, 160, 255, 0.55)",
  track: "rgba(255, 255, 255, 0.08)",
  fog: "rgba(8, 10, 16, 0.86)",
  explored: "#1A2130",
  grid: "rgba(120, 140, 180, 0.10)",
  district: "rgba(245, 196, 81, 0.45)",
  player: "#4CC3FF",
  good: "#3DD68C",
  locked: "#566075",
} as const;

export const skillColor: Record<SkillCode, string> = {
  vitality: "#F2555A",
  craft: "#F5A524",
  wealth: "#3DD68C",
  charisma: "#E05BB0",
  mindset: "#8B7CF6",
};

export const skillLabel: Record<SkillCode, string> = {
  vitality: "VIT", craft: "CRF", wealth: "WLT", charisma: "CHA", mindset: "MND",
};

export const tierLabel = {
  trivial: "Trivial", minor: "Minor", standard: "Standard", major: "Major", epic: "Epic", boss: "Boss",
} as const;
