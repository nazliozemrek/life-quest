// A pixel avatar drawn from a seed: 8x8 Views, no image download, the same face on every phone.
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { PALETTES, avatarPixels, type Avatar } from "../../game/social";
import { color } from "../theme";

export const AvatarSprite = memo(function AvatarSprite({ avatar, size = 48 }: { avatar: Avatar; size?: number }) {
  const grid = useMemo(() => avatarPixels(avatar.seed), [avatar.seed]);
  const [body, accent] = PALETTES[avatar.palette % PALETTES.length];
  const px = Math.floor((size - 8) / 8);
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: size / 4, borderColor: `${body}55` }]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {grid.map((row, y) => (
        <View key={y} style={styles.row}>
          {row.map((v, x) => (
            <View key={x} style={{ width: px, height: px, backgroundColor: v === 0 ? "transparent" : v === 1 ? body : accent }} />
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    alignItems: "center", justifyContent: "center", backgroundColor: color.explored,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: "row" },
});
