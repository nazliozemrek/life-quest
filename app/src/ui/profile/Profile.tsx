// Character sheet: who you are, what you wear, your main quests, and the five skill trees.
// Opened by tapping the HUD header. Unlocking is two taps: pick a node, then confirm in the detail panel.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CLASSES } from "../../../../src/onboarding/calibration";
import { playerLevels, skillLevels, type SkillCode } from "../../../../src/xp/xp-engine";
import { SKILLS, shownStreak, type Player, type Session } from "../../game/session";
import { activeGoals, type Goal, type Place, type PlaceKind } from "../../game/setup";
import { MAIN_QUEST_XP, finishBlocker } from "../../game/mainquest";
import { dayKey } from "../../game/persist";
import {
  NODES, TREES, canUnlock, nodeState, points, titles, treeStatus, xpBonus, type SkillNode,
} from "../../game/skilltree";
import { SetupFlow } from "../onboarding/Setup";
import { ACCOUNTS_ENABLED, BackupBox } from "../account/Account";
import { color, skillColor } from "../theme";
import { useSettings, useT } from "../settings";
import { say } from "../../i18n";

const BRANCHES = ["mastery", "path", "renown"] as const;

export interface ProfileProps {
  session: Session;
  onClose(): void;
  onUnlock(id: string): void;
  onTitle(title: string | null): void;
  onEditSetup(goals: Goal[], places: Place[]): void;
  onFinishGoal(id: string): void;
}

export function Profile({ session, onClose, onUnlock, onTitle, onEditSetup, onFinishGoal }: ProfileProps) {
  const { t, settings, update } = useSettings();
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
        initialGoals={activeGoals(p.profile?.goals)} initialPlaces={places} onCancel={() => setEditing(false)}
        onDone={(g, pl) => { onEditSetup(g, pl); setEditing(false); }} />
    );
  }

  const level = playerLevels.progress(p.totalXp);
  const cls = p.profile ? t(`class.${p.profile.className}`) : null;
  const owned = titles(p);
  const goals = activeGoals(p.profile?.goals);
  const finished = (p.profile?.goals ?? []).filter(g => g.doneAt);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Text style={styles.kicker}>{t("profile.kicker")}</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("common.close")}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{t("hud.lv")}</Text>
            <Text style={styles.badgeLevel}>{level.level}</Text>
          </View>
          <View style={styles.fill}>
            <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.sub}>{[p.title && t.p(p.title), cls].filter(Boolean).join(" · ")}</Text>
            <Text style={styles.stats}>
              {t("profile.stats", { xp: p.totalXp.toLocaleString(t.lang), streak: t("hud.streak", { n: shownStreak(session) }), mode: t(`mode.${p.difficulty}`) })}
            </Text>
          </View>
        </View>

        {owned.length > 0 && (
          <Section title={t("profile.title")}>
            <View style={styles.wrap}>
              <Pill label={cls ?? t("profile.none")} on={!p.title} onPress={() => onTitle(null)} />
              {owned.map(x => <Pill key={x} label={t.p(x)} on={p.title === x} onPress={() => onTitle(x)} />)}
            </View>
          </Section>
        )}

        <Section title={t("profile.goals")} action={{ label: t("profile.edit"), onPress: () => setEditing(true) }}>
          {goals.length ? goals.map(g => <GoalRow key={g.id} goal={g} onFinish={() => onFinishGoal(g.id)} />)
            : <Text style={styles.empty}>{t(finished.length ? "goal.pickNext" : "profile.noGoals")}</Text>}
          {finished.length > 0 && (
            <View style={styles.finished}>
              <Text style={styles.finishedHead}>{t("goal.completed")}</Text>
              {finished.slice().reverse().map(g => (
                <View key={g.id} style={styles.goal}>
                  <Text style={styles.check}>✓</Text>
                  <Text style={[styles.goalTitle, styles.goalDone]} numberOfLines={1}>{t.p(g.title)}</Text>
                  <Text style={styles.goalHorizon}>+{MAIN_QUEST_XP[g.horizon]} XP</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.places}>
            {places.length ? t("profile.places", { list: places.map(x => t(`place.${x.kind}`)).join(", ") }) : t("profile.noPlaces")}
          </Text>
        </Section>

        <Section title={t("profile.trees")}>
          <View style={styles.tabs}>
            {SKILLS.map(s => {
              const free = treeStatus(p, s).canBuy ? points(p, s).free : 0;
              return (
                <Pressable key={s} onPress={() => { setTab(s); setPicked(null); }}
                  style={[styles.tab, tab === s && { borderColor: skillColor[s], backgroundColor: `${skillColor[s]}1F` }]}
                  accessibilityRole="tab" accessibilityState={{ selected: tab === s }}>
                  <Text style={[styles.tabCode, { color: skillColor[s] }]}>{t(`skillShort.${s}`)}</Text>
                  <Text style={styles.tabLevel}>{skillLevels.levelFor(p.skills[s].xp)}</Text>
                  {free > 0 && <View style={[styles.dot, { backgroundColor: skillColor[s] }]} />}
                </Pressable>
              );
            })}
          </View>
          <Tree player={p} skill={tab} picked={picked} onPick={setPicked} />
        </Section>
        {ACCOUNTS_ENABLED && (
          <Section title={t("account.title")}>
            <BackupBox />
          </Section>
        )}

        <Section title={t("profile.settings")}>
          <Text style={styles.settingLabel}>{t("profile.language")}</Text>
          <View style={styles.wrap}>
            <Pill label="Türkçe" on={settings.lang === "tr"} onPress={() => update({ lang: "tr" })} />
            <Pill label="English" on={settings.lang === "en"} onPress={() => update({ lang: "en" })} />
          </View>
          <Text style={styles.settingLabel}>{t("profile.reminders")}</Text>
          <View style={styles.wrap}>
            <Pill label={t("profile.on")} on={settings.reminders === true} onPress={() => update({ reminders: true })} />
            <Pill label={t("profile.off")} on={settings.reminders === false} onPress={() => update({ reminders: false })} />
          </View>
          <Text style={styles.places}>{t("profile.remindersHint")}</Text>
        </Section>
      </ScrollView>

      {picked && <Detail player={p} id={picked} onUnlock={() => { onUnlock(picked); }} onClose={() => setPicked(null)} />}
    </SafeAreaView>
  );
}

function Tree({ player, skill, picked, onPick }: { player: Player; skill: SkillCode; picked: string | null; onPick(id: string): void }) {
  const t = useT();
  const nodes = TREES[skill];
  const pts = points(player, skill);
  const status = treeStatus(player, skill);
  const bonus = Math.round((xpBonus(player)[skill] ?? 0) * 100);
  const root = nodes[0];
  const cap = nodes[nodes.length - 1];
  const tint = skillColor[skill];
  return (
    <View style={styles.tree}>
      <Text style={styles.treeHead}>
        <Text style={[styles.treeName, { color: tint }]}>{t(`skill.${skill}`)}</Text>
        {"  " + (pts.free > 0 && !status.canBuy && status.nextLevel
          ? t(pts.free === 1 ? "profile.pointsSavedOne" : "profile.pointsSaved", { n: pts.free, level: status.nextLevel, bonus })
          : t(pts.free === 1 ? "profile.pointsOne" : "profile.points", { n: pts.free, bonus }))}
      </Text>
      <Node node={root} player={player} picked={picked} onPick={onPick} wide />
      <View style={styles.columns}>
        {BRANCHES.map(branch => (
          <View key={branch} style={styles.column}>
            <Text style={styles.branch}>{t(`profile.branch.${branch}`)}</Text>
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
  const t = useT();
  const state = nodeState(player, node.id);
  const tint = skillColor[node.skill];
  return (
    <Pressable onPress={() => onPick(node.id)} accessibilityRole="button" accessibilityLabel={`${t.p(node.name)}, ${t(`profile.state.${state}`)}`}
      style={[
        styles.node, wide && styles.nodeWide,
        state === "owned" && { borderColor: tint, backgroundColor: `${tint}26` },
        state === "available" && { borderColor: color.xp, borderStyle: "dashed" },
        state === "locked" && styles.nodeLocked,
        picked === node.id && styles.nodePicked,
      ]}>
      <Text style={[styles.nodeName, state === "locked" && styles.dimText]} numberOfLines={2}>{t.p(node.name)}</Text>
      <Text style={styles.nodeMeta} numberOfLines={1}>
        {state === "owned" ? `✓ ${t("profile.state.owned")}` : state === "available" ? t("profile.unlockCost", { n: node.cost }) : t("profile.reqLevel", { n: node.requiredLevel })}
      </Text>
    </Pressable>
  );
}

function Detail({ player, id, onUnlock, onClose }: { player: Player; id: string; onUnlock(): void; onClose(): void }) {
  const t = useT();
  const n = NODES.get(id)!;
  const state = nodeState(player, id);
  const check = canUnlock(player, id);
  return (
    <View style={styles.detail}>
      <View style={styles.detailTop}>
        <Text style={[styles.detailName, { color: skillColor[n.skill] }]}>{t.p(n.name)}</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t("common.close")}><Text style={styles.close}>✕</Text></Pressable>
      </View>
      <Text style={styles.detailDesc}>{say(t, n.description)}</Text>
      {state === "owned" ? (
        <Text style={styles.detailState}>{t("profile.state.owned")}</Text>
      ) : check.ok ? (
        <Pressable onPress={onUnlock} style={styles.unlock} accessibilityRole="button">
          <Text style={styles.unlockText}>{t(n.cost === 1 ? "profile.unlockOne" : "profile.unlockMany", { n: n.cost })}</Text>
        </Pressable>
      ) : (
        <Text style={styles.detailState}>{say(t, check.reason)}</Text>
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

/** An active main quest: tap "Done" to claim it, then confirm. Too-new goals say how many days are left. */
function GoalRow({ goal, onFinish }: { goal: Goal; onFinish(): void }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const blocked = finishBlocker(goal, dayKey(new Date()));
  const xp = MAIN_QUEST_XP[goal.horizon];
  const tint = goal.skill ? skillColor[goal.skill] : color.xp;
  return (
    <View style={[styles.goalBox, asking && { borderColor: tint }]}>
      <View style={styles.goal}>
        <View style={[styles.goalDot, { backgroundColor: tint }]} />
        <Text style={styles.goalTitle} numberOfLines={1}>{t.p(goal.title)}</Text>
        <Text style={styles.goalHorizon}>{t(`horizon.${goal.horizon}`)}</Text>
        <Pressable onPress={() => setAsking(a => !a)} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={t("goal.doneA11y", { goal: t.p(goal.title) })} style={styles.doneBtn}>
          <Text style={styles.doneText}>{t("goal.doneBtn")}</Text>
        </Pressable>
      </View>
      {asking && (
        <View style={styles.ask}>
          {blocked ? (
            <Text style={styles.askText}>{say(t, blocked)}</Text>
          ) : (
            <>
              <Text style={styles.askText}>
                {t("goal.ask", { xp, skill: goal.skill ? t(`skill.${goal.skill}`) : t("goal.allSkills") })}
              </Text>
              <View style={styles.askRow}>
                <Pressable onPress={() => setAsking(false)} style={styles.askNo} accessibilityRole="button">
                  <Text style={styles.askNoText}>{t("goal.notYet")}</Text>
                </Pressable>
                <Pressable onPress={() => { setAsking(false); onFinish(); }} accessibilityRole="button"
                  style={[styles.askYes, { backgroundColor: tint }]}>
                  <Text style={styles.askYesText}>{t("goal.claim", { xp })}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </View>
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
  goalBox: { borderRadius: 12, borderWidth: 1, borderColor: "transparent", marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 4 },
  doneBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "rgba(245,196,81,0.5)" },
  doneText: { color: color.xp, fontSize: 12, fontWeight: "700" },
  ask: { marginTop: 10, gap: 10 },
  askText: { color: color.textDim, fontSize: 14, lineHeight: 19 },
  askRow: { flexDirection: "row", gap: 8 },
  askNo: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: color.track },
  askNoText: { color: color.text, fontSize: 14, fontWeight: "600" },
  askYes: { flex: 2, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  askYesText: { color: color.bg, fontSize: 14, fontWeight: "800" },
  finished: { marginTop: 6, gap: 6 },
  finishedHead: { color: color.textFaint, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  check: { color: color.good, fontSize: 14, fontWeight: "800", width: 8 + 2 },
  goalDone: { color: color.textDim, textDecorationLine: "line-through" },
  settingLabel: { color: color.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 },
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
