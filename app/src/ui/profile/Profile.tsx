// Character sheet: who you are, what you wear, your main quests, and the five skill trees.
// Opened by tapping the HUD header. Unlocking is two taps: pick a node, then confirm in the detail panel.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CLASSES } from "../../../../src/onboarding/calibration";
import { playerLevels, skillLevels, type SkillCode } from "../../../../src/xp/xp-engine";
import { SKILLS, type Player, type Session } from "../../game/session";
import { PLACE_INFO, type Goal, type Place, type PlaceKind } from "../../game/setup";
import {
  NODES, TREES, canUnlock, nodeState, points, titles, xpBonus, type SkillNode,
} from "../../game/skilltree";
import { SetupFlow } from "../onboarding/Setup";
import { color, skillColor, skillLabel } from "../theme";

const CLASS_NAME = { warrior: "Warrior", artisan: "Artisan", merchant: "Merchant", bard: "Bard", sage: "Sage" } as const;
const SKILL_NAME: Record<SkillCode, string> = { vitality: "Vitality", craft: "Craft", wealth: "Wealth", charisma: "Charisma", mindset: "Mindset" };
const HORIZON = { week: "This week", month: "This month", year: "This year" } as const;
const BRANCHES = [["mastery", "Mastery"], ["path", "Path"], ["renown", "Renown"]] as const;

export interface ProfileProps {
  session: Session;
  onClose(): void;
  onUnlock(id: string): void;
  onTitle(title: string | null): void;
  onEditSetup(goals: Goal[], places: Place[]): void;
}

export function Profile({ session, onClose, onUnlock, onTitle, onEditSetup }: ProfileProps) {
  const p = session.player;
  const classSkill = p.profile ? CLASSES[p.profile.className].skill : "vitality";
  const [tab, setTab] = useState<SkillCode>(classSkill);
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const places = useMemo<Place[]>(() => (["home", "work", "gym"] as PlaceKind[]).flatMap(kind => {
    const w = session.waypoints.find(x => x.id === `wp_${kind}`);
    return w && p.profile?.setupDone ? [{ kind, lat: w.lat, lng: w.lng }] : [];
  }), [session.waypoints, p.profile?.setupDone]);

  if (editing) {
    return (
      <SetupFlow explored={session.explored} position={session.position}
        initialGoals={p.profile?.goals ?? []} initialPlaces={places} onCancel={() => setEditing(false)}
        onDone={(g, pl) => { onEditSetup(g, pl); setEditing(false); }} />
    );
  }

  const level = playerLevels.progress(p.totalXp);
  const cls = p.profile ? CLASS_NAME[p.profile.className] : null;
  const owned = titles(p);
  const goals = p.profile?.goals ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Text style={styles.kicker}>CHARACTER</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>LV</Text>
            <Text style={styles.badgeLevel}>{level.level}</Text>
          </View>
          <View style={styles.fill}>
            <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.sub}>{[p.title, cls].filter(Boolean).join(" · ")}</Text>
            <Text style={styles.stats}>
              {p.totalXp.toLocaleString()} XP · {p.streakDays}-day streak · {p.difficulty[0].toUpperCase() + p.difficulty.slice(1)} mode
            </Text>
          </View>
        </View>

        {owned.length > 0 && (
          <Section title="Title">
            <View style={styles.wrap}>
              <Pill label={cls ?? "None"} on={!p.title} onPress={() => onTitle(null)} />
              {owned.map(t => <Pill key={t} label={t} on={p.title === t} onPress={() => onTitle(t)} />)}
            </View>
          </Section>
        )}

        <Section title="Main quests" action={{ label: "Edit", onPress: () => setEditing(true) }}>
          {goals.length ? goals.map(g => (
            <View key={g.id} style={styles.goal}>
              <View style={[styles.goalDot, { backgroundColor: g.skill ? skillColor[g.skill] : color.xp }]} />
              <Text style={styles.goalTitle} numberOfLines={1}>{g.title}</Text>
              <Text style={styles.goalHorizon}>{HORIZON[g.horizon]}</Text>
            </View>
          )) : <Text style={styles.empty}>No goals yet.</Text>}
          <Text style={styles.places}>
            {places.length ? `Places: ${places.map(x => PLACE_INFO[x.kind].name).join(", ")}` : "No places pinned."}
          </Text>
        </Section>

        <Section title="Skill trees">
          <View style={styles.tabs}>
            {SKILLS.map(s => {
              const free = points(p, s).free;
              return (
                <Pressable key={s} onPress={() => { setTab(s); setPicked(null); }}
                  style={[styles.tab, tab === s && { borderColor: skillColor[s], backgroundColor: `${skillColor[s]}1F` }]}
                  accessibilityRole="tab" accessibilityState={{ selected: tab === s }}>
                  <Text style={[styles.tabCode, { color: skillColor[s] }]}>{skillLabel[s]}</Text>
                  <Text style={styles.tabLevel}>{skillLevels.levelFor(p.skills[s].xp)}</Text>
                  {free > 0 && <View style={[styles.dot, { backgroundColor: skillColor[s] }]} />}
                </Pressable>
              );
            })}
          </View>
          <Tree player={p} skill={tab} picked={picked} onPick={setPicked} />
        </Section>
      </ScrollView>

      {picked && <Detail player={p} id={picked} onUnlock={() => { onUnlock(picked); }} onClose={() => setPicked(null)} />}
    </SafeAreaView>
  );
}

function Tree({ player, skill, picked, onPick }: { player: Player; skill: SkillCode; picked: string | null; onPick(id: string): void }) {
  const nodes = TREES[skill];
  const pts = points(player, skill);
  const bonus = Math.round((xpBonus(player)[skill] ?? 0) * 100);
  const root = nodes[0];
  const cap = nodes[nodes.length - 1];
  const tint = skillColor[skill];
  return (
    <View style={styles.tree}>
      <Text style={styles.treeHead}>
        <Text style={[styles.treeName, { color: tint }]}>{SKILL_NAME[skill]}</Text>
        {`  ${pts.free} point${pts.free === 1 ? "" : "s"} to spend · +${bonus}% XP`}
      </Text>
      <Node node={root} player={player} picked={picked} onPick={onPick} wide />
      <View style={styles.columns}>
        {BRANCHES.map(([branch, label]) => (
          <View key={branch} style={styles.column}>
            <Text style={styles.branch}>{label}</Text>
            {nodes.filter(n => n.branch === branch).map(n => (
              <Node key={n.id} node={n} player={player} picked={picked} onPick={onPick} />
            ))}
          </View>
        ))}
      </View>
      <Node node={cap} player={player} picked={picked} onPick={onPick} wide />
    </View>
  );
}

function Node({ node, player, picked, onPick, wide }: { node: SkillNode; player: Player; picked: string | null; onPick(id: string): void; wide?: boolean }) {
  const state = nodeState(player, node.id);
  const tint = skillColor[node.skill];
  return (
    <Pressable onPress={() => onPick(node.id)} accessibilityRole="button" accessibilityLabel={`${node.name}, ${state}`}
      style={[
        styles.node, wide && styles.nodeWide,
        state === "owned" && { borderColor: tint, backgroundColor: `${tint}26` },
        state === "available" && { borderColor: color.xp, borderStyle: "dashed" },
        state === "locked" && styles.nodeLocked,
        picked === node.id && styles.nodePicked,
      ]}>
      <Text style={[styles.nodeName, state === "locked" && styles.dimText]} numberOfLines={2}>{node.name}</Text>
      <Text style={styles.nodeMeta} numberOfLines={1}>
        {state === "owned" ? "✓ Unlocked" : state === "available" ? `Unlock · ${node.cost} pt` : `Lv ${node.requiredLevel}`}
      </Text>
    </Pressable>
  );
}

function Detail({ player, id, onUnlock, onClose }: { player: Player; id: string; onUnlock(): void; onClose(): void }) {
  const n = NODES.get(id)!;
  const state = nodeState(player, id);
  const check = canUnlock(player, id);
  return (
    <View style={styles.detail}>
      <View style={styles.detailTop}>
        <Text style={[styles.detailName, { color: skillColor[n.skill] }]}>{n.name}</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close details"><Text style={styles.close}>✕</Text></Pressable>
      </View>
      <Text style={styles.detailDesc}>{n.description}</Text>
      {state === "owned" ? (
        <Text style={styles.detailState}>Unlocked</Text>
      ) : check.ok ? (
        <Pressable onPress={onUnlock} style={styles.unlock} accessibilityRole="button">
          <Text style={styles.unlockText}>Unlock for {n.cost} point{n.cost === 1 ? "" : "s"}</Text>
        </Pressable>
      ) : (
        <Text style={styles.detailState}>{check.reason}</Text>
      )}
    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: { label: string; onPress(): void }; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action && <Pressable onPress={action.onPress} hitSlop={10}><Text style={styles.action}>{action.label}</Text></Pressable>}
      </View>
      {children}
    </View>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, on && styles.pillOn]} accessibilityState={{ selected: on }}>
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  topBar: { height: 44, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: color.xp, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  close: { color: color.textDim, fontSize: 18 },
  scroll: { paddingHorizontal: 16, paddingBottom: 160, gap: 14 },
  hero: { flexDirection: "row", gap: 14, alignItems: "center", paddingVertical: 6 },
  badge: {
    width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: color.xp, backgroundColor: "rgba(245, 196, 81, 0.08)",
  },
  badgeLabel: { color: color.xp, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  badgeLevel: { color: color.text, fontSize: 26, fontWeight: "800", marginTop: -2 },
  name: { color: color.text, fontSize: 24, fontWeight: "800" },
  sub: { color: color.xp, fontSize: 14, fontWeight: "600", marginTop: 2 },
  stats: { color: color.textDim, fontSize: 12, marginTop: 4 },
  section: {
    padding: 14, borderRadius: 16, gap: 10,
    backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: color.text, fontSize: 16, fontWeight: "800" },
  action: { color: color.xp, fontSize: 14, fontWeight: "700" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.track },
  pillOn: { backgroundColor: color.xp },
  pillText: { color: color.textDim, fontSize: 13, fontWeight: "600" },
  pillTextOn: { color: color.bg },
  goal: { flexDirection: "row", alignItems: "center", gap: 10 },
  goalDot: { width: 8, height: 8, borderRadius: 4 },
  goalTitle: { color: color.text, fontSize: 15, flex: 1 },
  goalHorizon: { color: color.textDim, fontSize: 12 },
  empty: { color: color.textDim, fontSize: 14 },
  places: { color: color.textDim, fontSize: 12 },
  tabs: { flexDirection: "row", gap: 6 },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: color.panelBorder, backgroundColor: "rgba(255,255,255,0.03)",
  },
  tabCode: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  tabLevel: { color: color.text, fontSize: 16, fontWeight: "800" },
  dot: { position: "absolute", top: 5, right: 6, width: 7, height: 7, borderRadius: 4 },
  tree: { gap: 8, marginTop: 4 },
  treeHead: { color: color.textDim, fontSize: 13 },
  treeName: { fontWeight: "800" },
  columns: { flexDirection: "row", gap: 8 },
  column: { flex: 1, gap: 8 },
  branch: { color: color.textFaint, fontSize: 11, fontWeight: "800", letterSpacing: 1, textAlign: "center", textTransform: "uppercase" },
  node: {
    minHeight: 64, padding: 8, borderRadius: 12, justifyContent: "space-between",
    borderWidth: 1.5, borderColor: color.panelBorder, backgroundColor: "rgba(255,255,255,0.03)",
  },
  nodeWide: { minHeight: 52, alignItems: "center" },
  nodeLocked: { opacity: 0.55 },
  nodePicked: { borderColor: color.text },
  nodeName: { color: color.text, fontSize: 13, fontWeight: "700" },
  dimText: { color: color.textDim },
  nodeMeta: { color: color.textDim, fontSize: 11, marginTop: 4 },
  detail: {
    position: "absolute", left: 12, right: 12, bottom: 24, padding: 16, borderRadius: 16, gap: 8,
    backgroundColor: "#121722", borderWidth: 1, borderColor: "rgba(245, 196, 81, 0.35)",
  },
  detailTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailName: { fontSize: 18, fontWeight: "800" },
  detailDesc: { color: color.text, fontSize: 14 },
  detailState: { color: color.textDim, fontSize: 13, fontWeight: "600" },
  unlock: { marginTop: 4, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: color.xp },
  unlockText: { color: color.bg, fontSize: 15, fontWeight: "800" },
});
