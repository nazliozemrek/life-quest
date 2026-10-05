import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Hud, Player } from "../game/session";
import { color, skillColor, skillLabel } from "./theme";
import { XpBar } from "./XpBar";

const CLASS_NAME = { warrior: "Warrior", artisan: "Artisan", merchant: "Merchant", bard: "Bard", sage: "Sage" } as const;

/** Tap anywhere on it to open the character sheet. `points` > 0 shows a gold dot: there's a skill node to buy. */
export function HudHeader({ hud, player, points, onPress }: { hud: Hud; player: Player; points: number; onPress(): void }) {
  const cls = player.title ?? (player.profile && CLASS_NAME[player.profile.className]);
  return (
    <Pressable onPress={onPress} style={styles.panel} accessibilityRole="button"
      accessibilityLabel={`Open character${points ? `, ${points} skill unlocks available` : ""}`}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>LV</Text>
          <Text style={styles.badgeLevel}>{hud.level}</Text>
          {points > 0 && <View style={styles.pointsDot}><Text style={styles.pointsText}>{points}</Text></View>}
        </View>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {player.name}{cls && <Text style={styles.cls}>  {cls}</Text>}
            </Text>
            <Text style={styles.streak}>
              {hud.streakDays}-day streak <Text style={styles.mult}>×{hud.streakMult.toFixed(2)}</Text>
            </Text>
          </View>
          <XpBar level={hud.level} into={hud.into} need={hud.need} pct={hud.pct} restedPct={hud.restedPct} />
        </View>
      </View>

      <View style={styles.skills}>
        {hud.skills.map(s => (
          // Form fades the chip: a rusty skill reads as dimmed, which is also the hint that it pays a comeback bonus.
          <View key={s.code} style={[styles.skill, { opacity: 0.45 + 0.55 * s.form }]}>
            <Text style={[styles.skillCode, { color: skillColor[s.code] }]}>{skillLabel[s.code]}</Text>
            <Text style={styles.skillLevel}>{s.level}</Text>
            <View style={styles.skillTrack}>
              <View style={[styles.skillFill, { width: `${s.pct * 100}%`, backgroundColor: skillColor[s.code] }]} />
            </View>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 12, padding: 12, borderRadius: 16,
    backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: color.xp, backgroundColor: "rgba(245, 196, 81, 0.08)",
  },
  badgeLabel: { color: color.xp, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  pointsDot: {
    position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    alignItems: "center", justifyContent: "center", backgroundColor: color.xp,
  },
  pointsText: { color: color.bg, fontSize: 11, fontWeight: "900" },
  badgeLevel: { color: color.text, fontSize: 20, fontWeight: "800", marginTop: -2, fontVariant: ["tabular-nums"] },
  main: { flex: 1, gap: 6 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  name: { color: color.text, fontSize: 16, fontWeight: "700", flexShrink: 1, marginRight: 8 },
  cls: { color: color.textDim, fontSize: 12, fontWeight: "600" },
  streak: { color: color.textDim, fontSize: 12 },
  mult: { color: color.xp, fontWeight: "700" },
  skills: { flexDirection: "row", gap: 6, marginTop: 10 },
  skill: { flex: 1, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  skillCode: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  skillLevel: { color: color.text, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  skillTrack: { height: 3, borderRadius: 2, backgroundColor: color.track, marginTop: 4, overflow: "hidden" },
  skillFill: { height: 3 },
});
