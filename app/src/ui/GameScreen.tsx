import { cellToLatLng } from "h3-js";
import { useMemo, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Quest } from "../../../src/quests/quest-generator";
import { isPinnedPlace, hud as toHud, previewAward, questGate } from "../game/session";
import { availableCount } from "../game/skilltree";
import { HudHeader } from "./HudHeader";
import { Profile } from "./profile/Profile";
import { Onboarding } from "./onboarding/Onboarding";
import { SetupFlow } from "./onboarding/Setup";
import { ACCOUNTS_ENABLED, RestoreFlow } from "./account/Account";
import { fromCloud } from "../game/cloudsave";
import { createSession } from "../game/mock-world";
import { poolQuests } from "../game/context";
import { dayKey } from "../game/persist";
import { GameMap } from "./map/GameMap";
import type { LatLng, MapViewProps } from "./map/types";
import { QuestList, type QuestRowModel } from "./QuestList";
import { color } from "./theme";
import { Toast } from "./Toast";
import { useGameSession } from "./useGameSession";
import { useReminders } from "./useReminders";
import { useT } from "./settings";


export function GameScreen() {
  const game = useGameSession();
  const [restoring, setRestoring] = useState(false);
  // Blank until the save is read, so a returning player never sees character creation flash past.
  if (!game.loaded) return <View style={styles.screen} />;
  const { profile } = game.session.player;
  if (!profile && restoring) {
    return (
      <RestoreFlow onCancel={() => setRestoring(false)}
        onRestored={(save, cells) => {
          game.adoptRestored(fromCloud(save, cells, dayKey(new Date()), createSession, poolQuests), cells);
          setRestoring(false);
        }} />
    );
  }
  if (!profile) {
    return (
      <Onboarding onDone={game.begin} explored={game.session.explored} position={game.session.position}
        onRestore={ACCOUNTS_ENABLED ? () => setRestoring(true) : undefined} />
    );
  }
  if (!profile.setupDone) return <SetupFlow explored={game.session.explored} position={game.session.position} onDone={game.finishSetup} />;
  return <World game={game} />;
}

function World({ game }: { game: ReturnType<typeof useGameSession> }) {
  const { session, event, mode, walkTo, complete } = game;
  const [focused, setFocused] = useState<Quest | null>(null);
  const [sheet, setSheet] = useState(false);
  const t = useT();
  useReminders(session);
  const unlockable = useMemo(() => availableCount(session.player), [session.player]);
  const hud = useMemo(() => toHud(session), [session]);

  const rows = useMemo<QuestRowModel[]>(() => session.quests.map(entry => {
    const q = entry.quest;
    const wp = q.location.type === "waypoint" ? session.waypoints.find(w => w.id === q.location.ref) : undefined;
    const place = wp
      ? (isPinnedPlace(wp) ? t(`place.${wp.kind}` as "place.home") : wp.name)
      : q.location.type === "district" ? t.p(session.districtNames[q.location.ref ?? ""] ?? "Frontier") : null;
    return { entry, previewXp: previewAward(session, q).totalXp, gate: questGate(session, q), place };
  }), [session, t]);

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

  const mapWaypoints = useMemo(() => session.waypoints.map(w => (isPinnedPlace(w) ? { ...w, name: t(`place.${w.kind}` as "place.home") } : w)),
    [session.waypoints, t]);

  const mapProps: MapViewProps = {
    explored: session.explored,
    position: session.position,
    waypoints: mapWaypoints,
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
      <GameMap {...mapProps} />

      <SafeAreaView edges={["top"]} pointerEvents="box-none">
        <HudHeader hud={hud} player={session.player} points={unlockable} onPress={() => setSheet(true)} />
        <View style={styles.chips} pointerEvents="none">
          <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              <Text style={styles.chipStrong}>{t.p(district.name)}</Text>
              {" " + t("hud.pct", { n: Math.floor(district.pct * 100) })}
              {district.next && ` · ${t("hud.districtNext", { xp: district.next.xp, pct: district.next.pct * 100 })}`}
            </Text>
          </View>
          {mode !== "starting" && (
            <Text style={styles.hint} numberOfLines={1}>{t(mode === "gps" ? "hud.gps" : "hud.tapToWalk")}</Text>
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

      <Modal visible={sheet} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setSheet(false)}>
        <Profile session={session} onClose={() => setSheet(false)} onUnlock={game.unlock} onTitle={game.setTitle}
          onEditSetup={game.finishSetup} />
        <Toast event={event} />
      </Modal>
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
