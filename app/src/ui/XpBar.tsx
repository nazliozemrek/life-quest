import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { color } from "./theme";

interface Props { level: number; into: number; need: number; pct: number; restedPct: number }

/** Player XP bar. Rested XP is drawn ahead of the fill; a level up fills to the end, then refills from zero. */
export function XpBar({ level, into, need, pct, restedPct }: Props) {
  const fill = useRef(new Animated.Value(pct)).current;
  const prevLevel = useRef(level);

  useEffect(() => {
    const to = (v: number, ms: number) =>
      Animated.timing(fill, { toValue: v, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    if (level > prevLevel.current) {
      Animated.sequence([to(1, 350), Animated.timing(fill, { toValue: 0, duration: 0, useNativeDriver: false }), to(pct, 500)]).start();
    } else {
      to(pct, 450).start();
    }
    prevLevel.current = level;
  }, [level, pct, fill]);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: need, now: into }}>
        <View style={[styles.rested, { left: `${pct * 100}%`, width: `${restedPct * 100}%` }]} />
        <Animated.View style={[styles.fill, { width }]} />
      </View>
      <View style={styles.labels}>
        <Text style={styles.xp}>{into.toLocaleString("en-US")} / {need.toLocaleString("en-US")} XP</Text>
        {restedPct > 0 && <Text style={styles.restedLabel}>Rested ×2</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: 5, backgroundColor: color.track, overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: color.xp, borderRadius: 5 },
  rested: { position: "absolute", top: 0, bottom: 0, backgroundColor: color.rested },
  labels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  xp: { color: color.textDim, fontSize: 11, fontVariant: ["tabular-nums"] },
  restedLabel: { color: color.rested, fontSize: 11, fontWeight: "600" },
});
