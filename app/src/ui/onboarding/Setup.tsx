// Goals and places (pillar 4 flow E and F). Part of character creation, and shown once on their own to players
// whose character predates them. Both are optional: "Skip for now" is always there.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Fix } from "../../../../src/spatial/spatial-engine";
import { GOAL_SUGGESTIONS, MAX_GOALS, PLACE_INFO, placeWaypoints, type Goal, type Horizon, type Place, type PlaceKind } from "../../game/setup";
import { GameMap } from "../map/GameMap";
import type { LatLng } from "../map/types";
import { color, skillColor } from "../theme";
import { Button, Chip, useKeyboardInset } from "./parts";

const HORIZONS: [Horizon, string][] = [["week", "This week"], ["month", "This month"], ["year", "This year"]];
const KINDS: PlaceKind[] = ["home", "work", "gym"];

export function GoalsStep({ goals, setGoals, onNext }: { goals: Goal[]; setGoals: (g: Goal[]) => void; onNext: () => void }) {
  const [custom, setCustom] = useState("");
  const keyboard = useKeyboardInset();
  const full = goals.length >= MAX_GOALS;
  const has = (title: string) => goals.some(g => g.title === title);
  const add = (title: string, skill: Goal["skill"]) => {
    if (full || !title.trim() || has(title.trim())) return;
    setGoals([...goals, { id: `g${Date.now().toString(36)}${goals.length}`, title: title.trim(), horizon: "month", skill }]);
  };
  const remove = (id: string) => setGoals(goals.filter(g => g.id !== id));

  return (
    <View style={[styles.fill, { paddingBottom: keyboard }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Your main quests</Text>
        <Text style={styles.hint}>Pick up to three things you want to work toward. Daily quests will push you there.</Text>

        {goals.map(g => (
          <View key={g.id} style={[styles.goal, g.skill && { borderColor: skillColor[g.skill] }]}>
            <View style={styles.goalTop}>
              <Text style={styles.goalTitle} numberOfLines={2}>{g.title}</Text>
              <Pressable onPress={() => remove(g.id)} hitSlop={10} accessibilityLabel={`Remove ${g.title}`}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.horizons}>
              {HORIZONS.map(([h, label]) => (
                <Pressable key={h} onPress={() => setGoals(goals.map(x => (x.id === g.id ? { ...x, horizon: h } : x)))}
                  style={[styles.pill, g.horizon === h && styles.pillOn]} accessibilityState={{ selected: g.horizon === h }}>
                  <Text style={[styles.pillText, g.horizon === h && styles.pillTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {!full && (
          <>
            <View style={styles.chips}>
              {GOAL_SUGGESTIONS.filter(s => !has(s.title)).map(s => (
                <Chip key={s.title} label={s.title} on={false} tint={skillColor[s.skill]} onPress={() => add(s.title, s.skill)} />
              ))}
            </View>
            <View style={styles.customRow}>
              <TextInput
                style={styles.input} value={custom} onChangeText={setCustom} placeholder="Or write your own"
                placeholderTextColor={color.textFaint} maxLength={80} returnKeyType="done" keyboardAppearance="dark"
                onSubmitEditing={() => { add(custom, null); setCustom(""); }}
              />
              <Pressable onPress={() => { add(custom, null); setCustom(""); }} disabled={!custom.trim()}
                style={[styles.addBtn, !custom.trim() && styles.dim]} accessibilityLabel="Add goal">
                <Text style={styles.addText}>Add</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={goals.length ? "Continue" : "Skip for now"} secondary={!goals.length} onPress={onNext} />
      </View>
    </View>
  );
}

export function PlacesStep({ places, setPlaces, explored, position, onNext }: {
  places: Place[]; setPlaces: (p: Place[]) => void; explored: ReadonlySet<string>; position: Fix; onNext: () => void;
}) {
  const [kind, setKind] = useState<PlaceKind>("home");
  const [focus, setFocus] = useState<LatLng | null>(null);
  const waypoints = useMemo(() => placeWaypoints(places), [places]);
  const put = (at: LatLng) => {
    setPlaces([...places.filter(p => p.kind !== kind), { kind, lat: at.lat, lng: at.lng }]);
    setFocus(at);
    // Move on to the next empty kind, so pinning all three is three taps.
    const nextEmpty = KINDS.find(k => k !== kind && !places.some(p => p.kind === k));
    if (nextEmpty) setKind(nextEmpty);
  };
  const clear = (k: PlaceKind) => setPlaces(places.filter(p => p.kind !== k));

  return (
    <View style={styles.fill}>
      <Text style={styles.title}>Your places</Text>
      <Text style={styles.hint}>Pick a place, then tap the map where it is. They stay on this phone; quests only see "Home", "Work" or "Gym".</Text>
      <View style={styles.map}>
        <GameMap explored={explored} position={position} waypoints={waypoints} districts={[]} focus={focus} onPress={put} />
      </View>
      <View style={styles.kinds}>
        {KINDS.map(k => {
          const set = places.some(p => p.kind === k);
          return (
            <Pressable key={k} onPress={() => setKind(k)} style={[styles.kind, kind === k && styles.kindOn]}
              accessibilityRole="button" accessibilityState={{ selected: kind === k }}>
              <Text style={[styles.kindLabel, kind === k && styles.kindLabelOn]}>{PLACE_INFO[k].name}</Text>
              <Text style={styles.kindState}>{set ? "Pinned" : "Not set"}</Text>
              {set && (
                <Pressable onPress={() => clear(k)} hitSlop={8} accessibilityLabel={`Clear ${PLACE_INFO[k].name}`}>
                  <Text style={styles.clear}>Clear</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.footerRow}>
        <View style={styles.fill}>
          <Button label={`${PLACE_INFO[kind].name} is where I am`} secondary onPress={() => put({ lat: position.lat, lng: position.lng })} />
        </View>
      </View>
      <View style={styles.footer}>
        <Button label={places.length ? "Continue" : "Skip for now"} secondary={!places.length} onPress={onNext} />
      </View>
    </View>
  );
}

/** Goals and places on their own: once for a character made before they existed, and from the profile to edit. */
export function SetupFlow({ explored, position, onDone, onCancel, initialGoals = [], initialPlaces = [] }: {
  explored: ReadonlySet<string>; position: Fix; onDone: (goals: Goal[], places: Place[]) => void;
  onCancel?: () => void; initialGoals?: Goal[]; initialPlaces?: Place[];
}) {
  const [step, setStep] = useState<"goals" | "places">("goals");
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        {step === "places" ? (
          <Pressable onPress={() => setStep("goals")} hitSlop={12}><Text style={styles.topLink}>‹ Back</Text></Pressable>
        ) : onCancel ? (
          <Pressable onPress={onCancel} hitSlop={12}><Text style={styles.topLink}>‹ Cancel</Text></Pressable>
        ) : <Text style={styles.kicker}>NEW: GOALS AND PLACES</Text>}
      </View>
      <View style={styles.body}>
        {step === "goals"
          ? <GoalsStep goals={goals} setGoals={setGoals} onNext={() => setStep("places")} />
          : <PlacesStep places={places} setPlaces={setPlaces} explored={explored} position={position} onNext={() => onDone(goals, places)} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  topBar: { height: 44, paddingHorizontal: 20, justifyContent: "center" },
  topLink: { color: color.textDim, fontSize: 15 },
  kicker: { color: color.xp, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },
  fill: { flex: 1 },
  scroll: { paddingBottom: 24, gap: 10 },
  title: { color: color.text, fontSize: 26, fontWeight: "800", lineHeight: 32, marginTop: 8 },
  hint: { color: color.textDim, fontSize: 14, lineHeight: 19, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  goal: { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: color.xp, backgroundColor: color.panel, gap: 10 },
  goalTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  goalTitle: { color: color.text, fontSize: 16, fontWeight: "700", flex: 1 },
  remove: { color: color.textDim, fontSize: 16 },
  horizons: { flexDirection: "row", gap: 6 },
  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: color.track },
  pillOn: { backgroundColor: color.xp },
  pillText: { color: color.textDim, fontSize: 12, fontWeight: "600" },
  pillTextOn: { color: color.bg },
  customRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  input: {
    flex: 1, color: color.text, fontSize: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  addBtn: { paddingHorizontal: 16, borderRadius: 12, justifyContent: "center", backgroundColor: color.xp },
  addText: { color: color.bg, fontWeight: "800", fontSize: 15 },
  dim: { opacity: 0.4 },
  footer: { paddingTop: 8 },
  footerRow: { flexDirection: "row", paddingTop: 10 },
  map: { flex: 1, minHeight: 220, marginTop: 12, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: color.panelBorder },
  kinds: { flexDirection: "row", gap: 8, marginTop: 10 },
  kind: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: color.panelBorder, backgroundColor: color.panel },
  kindOn: { borderColor: color.xp, backgroundColor: "rgba(245, 196, 81, 0.10)" },
  kindLabel: { color: color.text, fontSize: 15, fontWeight: "700" },
  kindLabelOn: { color: color.xp },
  kindState: { color: color.textDim, fontSize: 12, marginTop: 2 },
  clear: { color: color.xp, fontSize: 12, fontWeight: "700", marginTop: 4 },
});
