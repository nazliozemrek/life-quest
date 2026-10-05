import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GameScreen } from "./src/ui/GameScreen";
import { SettingsProvider } from "./src/ui/settings";

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <GameScreen />
      </SettingsProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
