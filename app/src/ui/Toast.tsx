import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import type { GameEvent } from "./useGameSession";
import { color } from "./theme";

/** Reward popup: "+172 XP" floats up and fades; a level up holds a little longer. */
export function Toast({ event }: { event: (GameEvent & { id: number }) | null }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!event) return;
    anim.setValue(0);
    const hold = event.kind === "xp" && event.levelUp ? 1800 : 1000;
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.delay(hold),
      Animated.timing(anim, { toValue: 2, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [event, anim]);

  if (!event) return null;
  const opacity = anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const translateY = anim.interpolate({ inputRange: [0, 1, 2], outputRange: [20, 0, -20] });

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]}
      accessibilityLiveRegion="polite">
      {event.kind === "xp" ? (
        <>
          {event.levelUp && <Text style={styles.level}>LEVEL {event.levelUp}</Text>}
          <Text style={styles.xp}>+{event.xp} XP</Text>
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        </>
      ) : (
        <Text style={styles.error}>{event.message}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute", alignSelf: "center", top: "38%",
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 16, alignItems: "center",
    backgroundColor: "rgba(11,14,20,0.92)", borderWidth: 1, borderColor: "rgba(245,196,81,0.35)",
  },
  level: { color: color.xp, fontSize: 13, fontWeight: "900", letterSpacing: 3 },
  xp: { color: color.xp, fontSize: 30, fontWeight: "900", fontVariant: ["tabular-nums"] },
  title: { color: color.textDim, fontSize: 12, maxWidth: 240 },
  error: { color: color.text, fontSize: 13 },
});
