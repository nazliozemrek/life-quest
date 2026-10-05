// Haptics for game events: a quest turned in, a level up, an unlock, a refusal. Silent on web and wherever the
// device can't buzz; a haptic is never worth an error.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import type { GameEvent } from "./useGameSession";

const ON = Platform.OS === "ios" || Platform.OS === "android";

export function buzz(e: GameEvent): void {
  if (!ON) return;
  const run = (p: Promise<void>) => p.catch(() => {});
  if (e.kind === "xp" && e.levelUp) {
    // Level up: a heavy thump, then the success pattern, so it feels bigger than a normal quest.
    run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    setTimeout(() => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)), 180);
  } else if (e.kind === "xp") {
    run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  } else if (e.kind === "error") {
    run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  } else {
    run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  }
}
