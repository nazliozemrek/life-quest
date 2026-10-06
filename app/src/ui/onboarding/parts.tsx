// Building blocks shared by the character creation screens.
import { useEffect, useState } from "react";
import { Dimensions, Keyboard, LayoutAnimation, Platform, Pressable, StyleSheet, Text, type KeyboardEvent } from "react-native";
import { color } from "../theme";

export /**
 * How much of the screen bottom the keyboard covers. Measured from the keyboard's top edge rather than its height,
 * so iOS 26's floating keyboard (inset from the screen edge) is cleared too. KeyboardAvoidingView missed it.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const update = (e: KeyboardEvent) => {
      if (ios) LayoutAnimation.configureNext(LayoutAnimation.create(e.duration || 250, "keyboard", "opacity"));
      setInset(Math.max(0, Dimensions.get("screen").height - e.endCoordinates.screenY));
    };
    const hide = (e: KeyboardEvent) => {
      if (ios) LayoutAnimation.configureNext(LayoutAnimation.create(e.duration || 250, "keyboard", "opacity"));
      setInset(0);
    };
    const subs = ios
      ? [Keyboard.addListener("keyboardWillChangeFrame", update), Keyboard.addListener("keyboardWillHide", hide)]
      : [Keyboard.addListener("keyboardDidShow", update), Keyboard.addListener("keyboardDidHide", hide)];
    return () => subs.forEach(x => x.remove());
  }, []);
  return inset;
}

export function Choice({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.pressed]}>
      <Text style={[styles.choiceLabel, on && styles.choiceLabelOn]}>{label}</Text>
      {sub && <Text style={styles.choiceSub}>{sub}</Text>}
    </Pressable>
  );
}

export function Chip({ label, on, tint = color.xp, onPress }: { label: string; on: boolean; tint?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.chip, on && { borderColor: tint, backgroundColor: `${tint}22` }]}>
      <Text style={[styles.chipText, on && { color: color.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
    backgroundColor: color.panel, borderWidth: 1, borderColor: color.panelBorder,
  },
  choiceOn: { borderColor: color.xp, backgroundColor: "rgba(245, 196, 81, 0.10)" },
  choiceLabel: { color: color.text, fontSize: 17, fontWeight: "600" },
  choiceLabelOn: { color: color.xp },
  choiceSub: { color: color.textDim, fontSize: 13, marginTop: 2 },
  pressed: { opacity: 0.7 },
  chip: {
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999,
    backgroundColor: color.panel, borderWidth: 1, borderColor: color.panelBorder,
  },
  chipText: { color: color.textDim, fontSize: 14 },
  button: { paddingVertical: 16, borderRadius: 14, alignItems: "center", backgroundColor: color.xp },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.panelBorder },
  buttonText: { color: color.bg, fontSize: 17, fontWeight: "800" },
  buttonTextSecondary: { color: color.text },
  disabled: { opacity: 0.4 },
});
