// Around You: other players' big milestones, and one-tap Respect. Opt-in: until the player picks a username, the
// screen only explains what going public shares. No names, photos, places or messages anywhere.
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo, ActivityIndicator, Animated, Easing, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DifficultyMode } from "../../../../src/xp/xp-engine";
import type { Session } from "../../game/session";
import {
  feedLine, feedSkill, isBig, randomAvatar, regionOf, suggestUsername, timeAgo, titleNodeId, titleOf, usernameProblem,
  type Avatar, type FeedItem, type FeedScope, type GiveResult,
} from "../../game/social";
import { say, type Msg } from "../../i18n";
import { fetchFeed, giveRespect, myProfile, saveProfile, saveRegion, type MyProfile } from "../../net/social";
import { Button, useKeyboardInset } from "../onboarding/parts";
import { useT } from "../settings";
import { color, skillColor } from "../theme";
import { AvatarSprite } from "./Avatar";

/** While the screen is open, new cards are fetched this often. Nothing runs when it's closed. */
const REFRESH_MS = 90_000;
const PAGE = 30;
const DAY_MS = 86_400_000;

const MODE_COLOR: Record<DifficultyMode, string> = {
  peaceful: color.good, normal: color.textDim, hard: "#F5A524", hardcore: "#F2555A",
};

export function AroundYou({ session, onClose, onSeen }: { session: Session; onClose(): void; onSeen?(topId: string | null): void }) {
  const t = useT();
  const [me, setMe] = useState<MyProfile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMe(await myProfile());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { onSeen?.(null); }, [onSeen]);

  // Keep what others see in step with the game: the region (at most daily) and the worn title.
  const position = session.position;
  const title = titleNodeId(session.player.title);
  useEffect(() => {
    if (!me?.visible) return;
    const region = regionOf(position);
    if (region !== me.region || !me.regionAt || Date.now() - Date.parse(me.regionAt) > DAY_MS) {
      saveRegion(region).catch(() => {});
    }
    if (title !== me.titleId) saveProfile({ ...me, titleId: title }).then(r => r.ok && setMe({ ...me, titleId: title }));
  }, [me, position, title]);

  const header = (
    <View style={styles.topBar}>
      <Text style={styles.kicker}>{t("social.title")}</Text>
      <View style={styles.topActions}>
        {me?.visible && !editing && (
          <Pressable onPress={() => setEditing(true)} hitSlop={10} accessibilityRole="button">
            <Text style={styles.link}>{t("social.editProfile")}</Text>
          </Pressable>
        )}
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("common.close")}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
    </View>
  );

  let body;
  if (loading) body = <ActivityIndicator color={color.xp} style={{ marginTop: 48 }} />;
  else if (me === undefined) body = <Empty text={t("social.offline")} action={t("social.retry")} onPress={load} />;
  else if (editing || !me || !me.visible) {
    body = (
      <OptIn session={session} current={me} editing={editing}
        onSaved={p => { setMe(p); setEditing(false); }} onCancel={editing ? () => setEditing(false) : undefined} />
    );
  } else body = <Feed onSeen={onSeen} />;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      {header}
      {body}
    </SafeAreaView>
  );
}

// ---------- Opt in ----------

function OptIn({ session, current, editing, onSaved, onCancel }: {
  session: Session; current: MyProfile | null; editing: boolean;
  onSaved(p: MyProfile): void; onCancel?: () => void;
}) {
  const t = useT();
  const inset = useKeyboardInset();
  const seed0 = useRef(Math.floor(Math.random() * 2 ** 31)).current;
  const [username, setUsername] = useState(current?.username ?? suggestUsername(seed0));
  const [choices, setChoices] = useState<Avatar[]>(() => avatarChoices(seed0, current?.avatar));
  const [avatar, setAvatar] = useState<Avatar>(current?.avatar ?? choices[0]);
  const [showMode, setShowMode] = useState(current?.showMode ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Msg | null>(null);
  const problem = usernameProblem(username, session.player.name);

  const save = async (visible: boolean) => {
    if (problem && visible) return setError(problem);
    setBusy(true);
    setError(null);
    const next: MyProfile = {
      username: username.trim().toLowerCase(), avatar, showMode, visible,
      titleId: titleNodeId(session.player.title), region: current?.region ?? null, regionAt: current?.regionAt ?? null,
    };
    const r = await saveProfile(next);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (visible) saveRegion(regionOf(session.position)).catch(() => {});
    onSaved(next);
  };

  return (
    <ScrollView contentContainerStyle={[styles.form, { paddingBottom: 32 + inset }]} keyboardShouldPersistTaps="handled">
      {!editing && (
        <>
          <Text style={styles.h1}>{t("social.introTitle")}</Text>
          <Text style={styles.body}>{t("social.introBody")}</Text>
          <View style={styles.rules}>
            <Text style={styles.rule}>✓ {t("social.shares")}</Text>
            <Text style={styles.rule}>✕ {t("social.neverShares")}</Text>
          </View>
        </>
      )}

      <Text style={styles.label}>{t("social.username")}</Text>
      <View style={styles.nameRow}>
        <TextInput style={[styles.input, { flex: 1 }]} value={username} maxLength={20}
          onChangeText={s => { setUsername(s.toLowerCase().replace(/[^a-z0-9_]/g, "")); setError(null); }}
          autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" accessibilityLabel={t("social.username")} />
        <Pressable style={styles.smallBtn} accessibilityRole="button"
          onPress={() => setUsername(suggestUsername(Math.floor(Math.random() * 2 ** 31)))}>
          <Text style={styles.smallBtnText}>{t("social.generate")}</Text>
        </Pressable>
      </View>
      {problem && username.length >= 3
        ? <Text style={styles.error}>{say(t, problem)}</Text>
        : <Text style={styles.note}>{t("social.usernameNote")}</Text>}

      <Text style={styles.label}>{t("social.avatar")}</Text>
      <View style={styles.avatars}>
        {choices.map(a => {
          const on = a.seed === avatar.seed && a.palette === avatar.palette;
          return (
            <Pressable key={`${a.seed}:${a.palette}`} onPress={() => setAvatar(a)} accessibilityRole="button"
              accessibilityState={{ selected: on }} style={[styles.avatarPick, on && styles.avatarPickOn]}>
              <AvatarSprite avatar={a} size={42} />
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => setChoices(avatarChoices(Math.floor(Math.random() * 2 ** 31)))} accessibilityRole="button">
        <Text style={styles.link}>{t("social.reroll")}</Text>
      </Pressable>

      <Text style={styles.label}>{t("social.showMode")}</Text>
      <View style={styles.pills}>
        <Pill label={t("profile.on")} on={showMode} onPress={() => setShowMode(true)} />
        <Pill label={t("profile.off")} on={!showMode} onPress={() => setShowMode(false)} />
      </View>
      <Text style={styles.note}>{t("social.showModeNote")}</Text>

      {error && <Text style={styles.error}>{say(t, error)}</Text>}
      <Button label={t(editing ? "social.save" : "social.goPublic")} disabled={busy || (!!problem && username.length >= 3)}
        onPress={() => save(true)} />
      {editing && <Button secondary label={t("social.goPrivate")} disabled={busy} onPress={() => save(false)} />}
      {onCancel && (
        <Pressable onPress={onCancel} accessibilityRole="button"><Text style={styles.link}>{t("common.cancel")}</Text></Pressable>
      )}
    </ScrollView>
  );
}

function avatarChoices(seed: number, keep?: Avatar): Avatar[] {
  const list = Array.from({ length: 6 }, (_, i) => randomAvatar(seed + i * 7919));
  return keep ? [keep, ...list.slice(1)] : list;
}

// ---------- Feed ----------

function Feed({ onSeen }: { onSeen?(topId: string | null): void }) {
  const t = useT();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [scope, setScope] = useState<FeedScope>("peers");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(true);
  const [notice, setNotice] = useState<Msg | null>(null);
  const top = useRef<string | null>(null);
  const lastPull = useRef(0);

  const reload = useCallback(async () => {
    const page = await fetchFeed();
    if (!page) return setState(s => (s === "ready" ? s : "error"));
    setItems(page.items);
    setScope(page.scope);
    setMore(page.items.length >= PAGE);
    top.current = page.items[0]?.id ?? null;
    onSeen?.(top.current);
    setState("ready");
  }, [onSeen]);

  useEffect(() => { reload(); }, [reload]);

  // Only what's new since the top card, every 90 s, and only while this screen is open.
  useEffect(() => {
    const id = setInterval(async () => {
      const page = await fetchFeed(top.current ? { after: top.current } : {});
      if (!page?.items.length) return;
      top.current = page.items[0].id;
      onSeen?.(top.current);
      setItems(old => [...page.items, ...old.filter(o => !page.items.some(n => n.id === o.id))]);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [onSeen]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  const pull = async () => {
    if (Date.now() - lastPull.current < 10_000) return;
    lastPull.current = Date.now();
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const page = async () => {
    const last = items.at(-1);
    if (!more || !last) return;
    const next = await fetchFeed({ before: last.id });
    if (!next) return;
    setMore(next.items.length >= PAGE);
    setItems(old => [...old, ...next.items.filter(n => !old.some(o => o.id === n.id))]);
  };

  const give = useCallback(async (id: string): Promise<GiveResult> => {
    const r = await giveRespect(id);
    if (!r.ok && r.reason !== "offline") {
      setNotice(r.reason === "daily_cap" ? { key: "social.err.dailyCap" } : r.reason === "slow_down"
        ? { key: "social.err.slowDown" } : { key: "social.err.gone" });
    }
    return r;
  }, []);

  if (state === "loading") return <ActivityIndicator color={color.xp} style={{ marginTop: 48 }} />;
  if (state === "error") return <Empty text={t("social.offline")} action={t("social.retry")} onPress={reload} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.scopeRow}>
        <View style={styles.scopePill}>
          <Text style={styles.scopeText}>{t(scope === "nearby" ? "social.scope.nearby" : "social.scope.peers")}</Text>
        </View>
        <Text style={styles.scopeNote} numberOfLines={2}>
          {t(scope === "nearby" ? "social.scopeNote.nearby" : "social.scopeNote.peers")}
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={({ item }) => <FeedCard item={item} onGive={give} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={color.xp} />}
        onEndReached={page}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<Text style={styles.emptyText}>{t("social.empty")}</Text>}
      />
      {notice && (
        <View style={styles.notice} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={styles.noticeText}>{say(t, notice)}</Text>
        </View>
      )}
    </View>
  );
}

function FeedCard({ item, onGive }: { item: FeedItem; onGive(id: string): Promise<GiveResult> }) {
  const t = useT();
  const a = item.author;
  const skill = feedSkill(item.event);
  const tint = skill ? skillColor[skill] : color.xp;
  const title = titleOf(a.titleId);
  const big = isBig(item.event);
  return (
    <View style={[styles.card, big && styles.cardBig]}>
      <View style={styles.cardTop}>
        <AvatarSprite avatar={a.avatar} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.idRow}>
            <Text style={styles.username} numberOfLines={1}>{a.username}</Text>
            {item.mine && <Text style={styles.you}>{t("social.you")}</Text>}
          </View>
          <View style={styles.idRow}>
            <Text style={styles.meta} numberOfLines={1}>
              {t("social.level", { n: a.level })}
              {title ? ` · ${t.p(title.phrase)}` : a.classCode ? ` · ${t(`class.${a.classCode}` as "class.bard")}` : ""}
            </Text>
            {a.mode && <ModeBadge mode={a.mode} />}
          </View>
        </View>
      </View>
      <View style={styles.milestone}>
        <View style={[styles.icon, { backgroundColor: `${tint}2E` }]}>
          <Text style={[styles.iconText, { color: tint }]}>{item.event.kind === "level_up" ? "▲" : item.event.kind === "district" ? "◈" : "✦"}</Text>
        </View>
        <Text style={styles.line}>{say(t, feedLine(item.event))}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.time}>{say(t, timeAgo(item.createdAt, Date.now()))}</Text>
        {item.mine
          ? <Text style={styles.countPlain}>{t("social.respectCount", { n: item.respectCount })}</Text>
          : <RespectButton item={item} onGive={onGive} />}
      </View>
    </View>
  );
}

function ModeBadge({ mode }: { mode: DifficultyMode }) {
  const t = useT();
  const c = MODE_COLOR[mode];
  return (
    <View style={[styles.badge, { borderColor: `${c}88` }]}>
      <Text style={[styles.badgeText, { color: c }]}>{t(`mode.${mode}`).toUpperCase()}</Text>
    </View>
  );
}

// ---------- Respect ----------

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

const SPARKS = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
const buzz = (p: Promise<void>) => { p.catch(() => {}); };

/**
 * One tap, optimistic: the haptic and the gold fill happen on touch, before the network answers.
 * Press in: selection tick, scale 0.92. Sent: medium impact, spring back, gold fill, sparks, count +1.
 * Refused by the server (daily cap, burst): warning buzz, a shake, back to idle. Offline: stays gold.
 */
function RespectButton({ item, onGive }: { item: FeedItem; onGive(id: string): Promise<GiveResult> }) {
  const t = useT();
  const reduce = useReduceMotion();
  const [given, setGiven] = useState(item.respectedByMe);
  const [count, setCount] = useState(item.respectCount);
  const scale = useRef(new Animated.Value(1)).current;
  const fill = useRef(new Animated.Value(item.respectedByMe ? 1 : 0)).current;
  const spark = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;

  const pressTo = (to: number, ms: number) => {
    if (reduce) return;
    Animated.timing(scale, { toValue: to, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  const give = async () => {
    if (given) return;
    setGiven(true);
    setCount(c => c + 1);
    buzz(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    spark.setValue(0);
    lift.setValue(0);
    Animated.parallel([
      Animated.timing(fill, { toValue: 1, duration: 160, useNativeDriver: true }),
      ...(reduce ? [] : [
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
        Animated.timing(spark, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(lift, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(lift, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
    const r = await onGive(item.id);
    if (!r.ok && r.reason !== "offline") {
      setGiven(false);
      setCount(c => c - 1);
      buzz(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
      Animated.timing(fill, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      if (!reduce) {
        shake.setValue(0);
        Animated.timing(shake, { toValue: 1, duration: 240, easing: Easing.linear, useNativeDriver: true }).start();
      }
    }
  };

  const translateX = shake.interpolate({ inputRange: [0, 1 / 6, 3 / 6, 5 / 6, 1], outputRange: [0, -4, 4, -4, 0] });
  const countY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <Pressable
      onPressIn={() => { if (!given) { pressTo(0.92, 80); buzz(Haptics.selectionAsync()); } }}
      onPressOut={() => pressTo(1, 120)}
      onPress={give}
      disabled={given}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: given, disabled: given }}
      accessibilityLabel={t(given ? "social.respected" : "social.giveRespect", { n: count })}>
      <View style={styles.respectWrap}>
        {SPARKS.map(angle => (
          <Animated.View key={angle} pointerEvents="none" style={[styles.spark, {
            opacity: spark.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 30] }) },
              { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 22] }) },
            ],
          }]} />
        ))}
        <Animated.View style={[styles.respect, given && styles.respectGiven, { transform: [{ scale }, { translateX }] }]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.respectFill, { opacity: fill }]} />
          <Text style={[styles.respectText, given && styles.respectTextGiven]}>{t("social.gz")}</Text>
          <Animated.Text style={[styles.respectCount, given && styles.respectTextGiven, { transform: [{ translateY: countY }] }]}>
            {count}
          </Animated.Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ---------- Bits ----------

function Empty({ text, action, onPress }: { text: string; action: string; onPress(): void }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{text}</Text>
      <Button secondary label={action} onPress={onPress} />
    </View>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.pill, on && styles.pillOn]}>
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  topBar: { height: 44, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  kicker: { color: color.xp, fontSize: 13, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  close: { color: color.textDim, fontSize: 20 },
  link: { color: color.xp, fontSize: 14, fontWeight: "700", textAlign: "center", paddingVertical: 4 },

  form: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  h1: { color: color.text, fontSize: 26, fontWeight: "800" },
  body: { color: color.textDim, fontSize: 15, lineHeight: 21 },
  rules: {
    gap: 6, padding: 14, borderRadius: 14, backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  rule: { color: color.text, fontSize: 14, lineHeight: 19 },
  label: { color: color.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 10 },
  note: { color: color.textFaint, fontSize: 12, lineHeight: 16 },
  nameRow: { flexDirection: "row", gap: 8 },
  input: {
    color: color.text, fontSize: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  smallBtn: { justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, backgroundColor: color.track },
  smallBtnText: { color: color.text, fontSize: 14, fontWeight: "600" },
  avatars: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  avatarPick: { padding: 3, borderRadius: 16, borderWidth: 2, borderColor: "transparent" },
  avatarPickOn: { borderColor: color.xp },
  pills: { flexDirection: "row", gap: 8 },
  pill: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.track },
  pillOn: { backgroundColor: color.xp },
  pillText: { color: color.textDim, fontSize: 13, fontWeight: "600" },
  pillTextOn: { color: color.bg },
  error: { color: "#F2555A", fontSize: 14 },

  scopeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingBottom: 8 },
  scopePill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(245,196,81,0.14)" },
  scopeText: { color: color.xp, fontSize: 12, fontWeight: "700" },
  scopeNote: { flex: 1, color: color.textFaint, fontSize: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },

  card: {
    padding: 14, gap: 10, borderRadius: 14, backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  cardBig: { borderWidth: 1, borderColor: color.xp },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  idRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  username: { color: color.text, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  you: { color: color.xp, fontSize: 11, fontWeight: "700" },
  meta: { color: color.textDim, fontSize: 12, fontWeight: "500", flexShrink: 1 },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  milestone: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 13, fontWeight: "800" },
  line: { flex: 1, color: color.text, fontSize: 15, lineHeight: 20 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  time: { color: color.textFaint, fontSize: 12 },
  countPlain: { color: color.textDim, fontSize: 13, fontWeight: "600" },

  respectWrap: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  respect: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: color.textFaint, overflow: "hidden",
  },
  respectGiven: { borderColor: color.xp },
  respectFill: { backgroundColor: "rgba(245,196,81,0.16)" },
  respectText: { color: color.textDim, fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },
  respectCount: { color: color.textDim, fontSize: 13, fontWeight: "700" },
  respectTextGiven: { color: color.xp },
  spark: { position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: color.xp },

  notice: {
    position: "absolute", left: 24, right: 24, bottom: 24, padding: 12, borderRadius: 12,
    backgroundColor: color.panel, borderWidth: 1, borderColor: "rgba(245,196,81,0.4)",
  },
  noticeText: { color: color.text, fontSize: 14, textAlign: "center" },
  emptyBox: { padding: 24, gap: 16 },
  emptyText: { color: color.textDim, fontSize: 15, lineHeight: 21, textAlign: "center", marginTop: 24 },
});
