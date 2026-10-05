import { StyleSheet, Text, View } from "react-native";
import type { Hud } from "../game/session";
import { color, skillColor, skillLabel } from "./theme";
import { XpBar } from "./XpBar";

export function HudHeader({ hud, name }: { hud: Hud; name: string }) {
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>LV</Text>
          <Text style={styles.badgeLevel}>{hud.level}</Text>
        </View>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{name}</Text>
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
    </View>
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
  badgeLevel: { color: color.text, fontSize: 20, fontWeight: "800", marginTop: -2, fontVariant: ["tabular-nums"] },
  main: { flex: 1, gap: 6 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  name: { color: color.text, fontSize: 16, fontWeight: "700" },
  streak: { color: color.textDim, fontSize: 12 },
  mult: { color: color.xp, fontWeight: "700" },
  skills: { flexDirection: "row", gap: 6, marginTop: 10 },
  skill: { flex: 1, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  skillCode: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  skillLevel: { color: color.text, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  skillTrack: { height: 3, borderRadius: 2, backgroundColor: color.track, marginTop: 4, overflow: "hidden" },
  skillFill: { height: 3 },
});
