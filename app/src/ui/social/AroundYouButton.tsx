// The Around You button on the map, with a red dot for new cards and a short teaser of the newest one, so the
// player knows something happened before they open it. The teaser shows for a few seconds per new card, then
// only the dot stays.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { badgeText, feedLine } from "../../game/social";
import { say } from "../../i18n";
import { useT } from "../settings";
import { color } from "../theme";
import { AvatarSprite } from "./Avatar";
import type { Badge } from "./useAroundYouBadge";

const TEASER_MS = 7000;
const RED = "#F2555A";

export function AroundYouButton({ badge, onPress }: { badge: Badge; onPress(): void }) {
  const t = useT();
  const { count, peek, firstTime } = badge;
  const lit = count > 0 || firstTime;
  const pulse = useRef(new Animated.Value(0)).current;
  const teaser = useRef(new Animated.Value(0)).current;
  const [showTeaser, setShowTeaser] = useState(false);
  const teaserKey = peek?.id ?? (firstTime ? "first" : null);

  // A slow ring around the dot while something is waiting.
  useEffect(() => {
    if (!lit) return;
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduce => {
      if (reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(600),
      ]));
      pulse.setValue(0);
      loop.start();
    });
    return () => loop?.stop();
  }, [lit, pulse]);

  // The teaser slides in once per new card.
  useEffect(() => {
    if (!teaserKey) return setShowTeaser(false);
    setShowTeaser(true);
    teaser.setValue(0);
    Animated.spring(teaser, { toValue: 1, friction: 7, useNativeDriver: true }).start();
    const id = setTimeout(() => {
      Animated.timing(teaser, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setShowTeaser(false));
    }, TEASER_MS);
    return () => clearTimeout(id);
  }, [teaserKey, teaser]);

  const label = count > 0 ? t("social.newCards", { n: count }) : t("social.open");

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button"
        accessibilityLabel={count > 0 ? `${t("social.open")}, ${label}` : t("social.open")}
        style={({ pressed }) => [styles.chip, lit && styles.chipLit, pressed && { opacity: 0.7 }]}>
        <Text style={styles.text}>{t("social.open")}</Text>
        {lit && (
          <View style={styles.dotBox} pointerEvents="none">
            <Animated.View style={[styles.ring, {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
            }]} />
            <View style={[styles.dot, count > 0 && styles.dotCount]}>
              {count > 0 && <Text style={styles.dotText}>{badgeText(count)}</Text>}
            </View>
          </View>
        )}
      </Pressable>

      {showTeaser && (
        <Animated.View style={[styles.teaser, {
          opacity: teaser,
          transform: [{ translateY: teaser.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        }]}>
          <Pressable onPress={onPress} style={styles.teaserRow} accessibilityRole="button">
            {peek ? (
              <>
                <AvatarSprite avatar={peek.author.avatar} size={28} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.teaserName} numberOfLines={1}>{peek.author.username}</Text>
                  <Text style={styles.teaserLine} numberOfLines={1}>{say(t, feedLine(peek.event))}</Text>
                  {count > 1 && <Text style={styles.teaserMore}>{t("social.andMore", { n: count - 1 })}</Text>}
                </View>
                <Text style={styles.gz}>{t("social.gz")}</Text>
              </>
            ) : (
              <Text style={styles.teaserLine}>{t("social.invite")}</Text>
            )}
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginHorizontal: 12, alignItems: "flex-end", gap: 6 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.panel,
    borderWidth: 1, borderColor: "rgba(245,196,81,0.45)",
  },
  chipLit: { borderColor: color.xp, backgroundColor: "rgba(40,32,12,0.94)" },
  text: { color: color.xp, fontSize: 12, fontWeight: "700" },
  dotBox: { position: "absolute", top: -6, right: -6, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: RED },
  dot: {
    minWidth: 12, height: 12, borderRadius: 6, backgroundColor: RED,
    borderWidth: 2, borderColor: color.bg, alignItems: "center", justifyContent: "center",
  },
  dotCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4 },
  dotText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  teaser: {
    maxWidth: 280, borderRadius: 14, backgroundColor: color.panel, borderWidth: 1, borderColor: "rgba(245,196,81,0.35)",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  teaserRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10 },
  teaserName: { color: color.text, fontSize: 13, fontWeight: "700" },
  teaserLine: { color: color.textDim, fontSize: 12 },
  teaserMore: { color: color.xp, fontSize: 11, fontWeight: "600", marginTop: 1 },
  gz: {
    color: color.xp, fontSize: 11, fontWeight: "800", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(245,196,81,0.5)", overflow: "hidden",
  },
});
