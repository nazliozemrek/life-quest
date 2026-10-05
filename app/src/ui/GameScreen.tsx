import { isRunningInExpoGo } from "expo";
import { cellToLatLng } from "h3-js";
import { Suspense, lazy, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Quest } from "../../../src/quests/quest-generator";
import { hud as toHud, previewAward, questGate } from "../game/session";
import { HudHeader } from "./HudHeader";
import { PlaceholderMap } from "./map/PlaceholderMap";
import type { LatLng, MapViewProps } from "./map/types";
import { QuestList, type QuestRowModel } from "./QuestList";
import { color } from "./theme";
import { Toast } from "./Toast";
import { useGameSession } from "./useGameSession";

const MapboxMap = lazy(() => import("./map/MapboxMap"));
const USE_MAPBOX = !!process.env.EXPO_PUBLIC_MAPBOX_TOKEN && Platform.OS !== "web" && !isRunningInExpoGo();

export function GameScreen() {
  const { session, event, mode, walkTo, complete } = useGameSession();
  const [focused, setFocused] = useState<Quest | null>(null);
  const hud = useMemo(() => toHud(session), [session]);

  const rows = useMemo<QuestRowModel[]>(() => session.quests.map(entry => {
    const q = entry.quest;
    const place = q.location.type === "waypoint"
      ? session.waypoints.find(w => w.id === q.location.ref)?.name ?? null
      : q.location.type === "district" ? session.districtNames[q.location.ref ?? ""] ?? "Frontier" : null;
    return { entry, previewXp: previewAward(session, q).totalXp, gate: questGate(session, q), place };
  }), [session]);

  const focus = useMemo<LatLng | null>(() => {
    if (!focused) return null;
    if (focused.location.type === "waypoint") return session.waypoints.find(w => w.id === focused.location.ref) ?? null;
    if (focused.location.type === "district" && focused.location.ref) {
      // A district is ~5 km² and its center is usually off-screen: frame the way there instead.
      const [lat, lng] = cellToLatLng(focused.location.ref);
      return { lat: (lat + session.position.lat) / 2, lng: (lng + session.position.lng) / 2 };
    }
    return null;
  }, [focused, session.waypoints, session.position]);

  const districts = useMemo(() => {
    const target = focused?.location.type === "district" ? focused.location.ref : null;
    return [
      { id: hud.district.id, highlight: false },
      ...(target && target !== hud.district.id ? [{ id: target, highlight: true }] : []),
    ];
  }, [hud.district.id, focused]);

  const mapProps: MapViewProps = {
    explored: session.explored,
    position: session.position,
    waypoints: session.waypoints,
    districts,
    focus,
    onPress: target => {
      setFocused(null);
      if (mode === "simulated") walkTo(target);  // with GPS on, only walking moves the player
    },
  };

  const { district } = hud;

  return (
    <View style={styles.screen}>
      {USE_MAPBOX ? (
        <Suspense fallback={<PlaceholderMap {...mapProps} />}><MapboxMap {...mapProps} /></Suspense>
      ) : (
        <PlaceholderMap {...mapProps} />
      )}

      <SafeAreaView edges={["top"]} pointerEvents="box-none">
        <HudHeader hud={hud} name={session.player.name} />
        <View style={styles.chips} pointerEvents="none">
          <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              <Text style={styles.chipStrong}>{district.name}</Text>
              {` ${Math.floor(district.pct * 100)}%`}
              {district.next && ` · +${district.next.xp} XP at ${district.next.pct * 100}%`}
            </Text>
          </View>
          {mode !== "starting" && (
            <Text style={styles.hint} numberOfLines={1}>{mode === "gps" ? "GPS on · walk to explore" : "Tap map to walk"}</Text>
          )}
        </View>
      </SafeAreaView>

      <View style={styles.sheet} pointerEvents="box-none">
        <QuestList
          rows={rows}
          done={hud.questsDone}
          total={hud.questsTotal}
          onComplete={complete}
          onLocate={q => setFocused(f => (f?.local_id === q.local_id ? null : q))}
        />
      </View>

      <Toast event={event} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  chips: { marginTop: 8, marginHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chip: {
    flexShrink: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  chipStrong: { color: color.xp, fontSize: 12, fontWeight: "700" },
  chipText: { color: color.textDim, fontSize: 12 },
  hint: {
    color: color.textDim, fontSize: 11, marginLeft: 8, flexShrink: 0, overflow: "hidden",
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: color.panel,
  },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end" },
});
