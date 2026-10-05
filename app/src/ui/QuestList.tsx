import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Quest } from "../../../src/quests/quest-generator";
import type { Gate, QuestEntry } from "../game/session";
import { color, skillColor, skillLabel, tierLabel } from "./theme";

export interface QuestRowModel { entry: QuestEntry; previewXp: number; gate: Gate; place: string | null }

interface Props {
  rows: QuestRowModel[];
  done: number;
  total: number;
  onComplete(localId: string): void;
  onLocate(quest: Quest): void;
}

/** Bottom quest log. Open quests first (available before blocked), finished ones sink to the bottom. */
export function QuestList({ rows, done, total, onComplete, onLocate }: Props) {
  const [open, setOpen] = useState(true);
  const rank = (r: QuestRowModel) => (r.entry.status === "done" ? 2 : r.gate.ok ? 0 : 1);
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));

  return (
    <View style={[styles.sheet, open ? styles.sheetOpen : null]}>
      <Pressable onPress={() => setOpen(o => !o)} style={styles.header} accessibilityRole="button"
        accessibilityLabel={open ? "Collapse quest log" : "Expand quest log"}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Today's Quests</Text>
          <Text style={styles.count}>{done}/{total}</Text>
        </View>
      </Pressable>
      {open && (
        <ScrollView contentContainerStyle={styles.list}>
          {sorted.map(r => (
            <QuestRow key={r.entry.quest.local_id} row={r} onComplete={onComplete} onLocate={onLocate} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function QuestRow({ row, onComplete, onLocate }: { row: QuestRowModel } & Pick<Props, "onComplete" | "onLocate">) {
  const { quest: q, status, awardedXp } = row.entry;
  const done = status === "done";
  const lead = q.skill_weights.reduce((a, b) => (b.weight > a.weight ? b : a)).skill;

  return (
    <Pressable
      onPress={() => q.location.type !== "none" && onLocate(q)}
      style={[styles.row, done && styles.rowDone]}
      accessibilityHint={q.location.type !== "none" ? "Shows the quest location on the map" : undefined}
    >
      <View style={[styles.stripe, { backgroundColor: skillColor[lead] }]} />
      <View style={styles.body}>
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={1}>{q.title}</Text>
        <Text style={styles.objective} numberOfLines={2}>{q.objective}</Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{tierLabel[q.tier]}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{q.estimated_minutes} min</Text>
          {row.place && (<><Text style={styles.metaDot}>·</Text><Text style={styles.metaText}>{row.place}</Text></>)}
          {q.skill_weights.map(w => (
            <Text key={w.skill} style={[styles.skillTag, { color: skillColor[w.skill] }]}>{skillLabel[w.skill]}</Text>
          ))}
        </View>
        {!done && !row.gate.ok && <Text style={styles.blocked}>{row.gate.reason}</Text>}
      </View>

      <View style={styles.side}>
        <Text style={[styles.xp, done && styles.xpDone]}>+{done ? awardedXp : row.previewXp}</Text>
        <Text style={styles.xpUnit}>XP</Text>
        {done ? (
          <Text style={styles.check}>Done</Text>
        ) : (
          <Pressable
            disabled={!row.gate.ok}
            onPress={() => onComplete(q.local_id)}
            style={({ pressed }) => [styles.button, !row.gate.ok && styles.buttonLocked, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Complete ${q.title}`}
            accessibilityState={{ disabled: !row.gate.ok }}
            hitSlop={8}
          >
            <Text style={[styles.buttonText, !row.gate.ok && styles.buttonTextLocked]}>Complete</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: color.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  sheetOpen: { maxHeight: "46%" },
  header: { paddingTop: 8, paddingBottom: 10, paddingHorizontal: 16 },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: color.textFaint, marginBottom: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  heading: { color: color.text, fontSize: 16, fontWeight: "700" },
  count: { color: color.textDim, fontSize: 13, fontVariant: ["tabular-nums"] },
  list: { paddingHorizontal: 12, paddingBottom: 24, gap: 8 },
  row: { flexDirection: "row", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", overflow: "hidden" },
  rowDone: { opacity: 0.5 },
  stripe: { width: 4 },
  body: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, gap: 3 },
  title: { color: color.text, fontSize: 14, fontWeight: "700" },
  titleDone: { textDecorationLine: "line-through" },
  objective: { color: color.textDim, fontSize: 12, lineHeight: 16 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 2 },
  metaText: { color: color.textFaint, fontSize: 11 },
  metaDot: { color: color.textFaint, fontSize: 11 },
  skillTag: { fontSize: 10, fontWeight: "800", marginLeft: 4 },
  blocked: { color: color.xp, fontSize: 11, marginTop: 2 },
  side: { width: 86, alignItems: "flex-end", justifyContent: "center", paddingRight: 10, gap: 2 },
  xp: { color: color.xp, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  xpDone: { color: color.good },
  xpUnit: { color: color.textFaint, fontSize: 10, marginTop: -4 },
  check: { color: color.good, fontSize: 12, fontWeight: "700", marginTop: 4 },
  button: { marginTop: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: color.xp },
  buttonLocked: { backgroundColor: "rgba(255,255,255,0.06)" },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: "#1B1405", fontSize: 12, fontWeight: "800" },
  buttonTextLocked: { color: color.locked },
});
