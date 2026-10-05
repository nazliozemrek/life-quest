// Character creation (pillar 4 flow A–H). One question per card, every Life Load card skippable,
// health and money behind a consent card, then the difficulty reveal and the starting-level fill.
// Goals (E) and places (F) come later: they need the quest generator and real waypoints.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ACHIEVEMENTS, CLASSES, MODE_ORDER, backstoryXp, calibrate,
  type AchievementCode, type ClassCode, type LifeEvent, type OnboardingAnswers,
} from "../../../../src/onboarding/calibration";
import { DIFFICULTY_MULT, playerLevels, skillLevels, type DifficultyMode, type SkillCode } from "../../../../src/xp/xp-engine";
import { CREATION_QUEST, SKIPPED } from "../../game/onboarding";
import { SKILLS } from "../../game/session";
import { color, skillColor, skillLabel } from "../theme";

type A = OnboardingAnswers;
interface Option { label: string; sub?: string; apply: (a: A) => A; selected: (a: A) => boolean }

/** One single-choice option that sets one answer field. */
function opt<K extends keyof A>(field: K, value: A[K], label: string, sub?: string): Option {
  return { label, sub, apply: a => ({ ...a, [field]: value }), selected: a => a[field] === value };
}

type Card =
  | { id: string; kind: "single"; title: string; hint?: string; options: Option[] }
  | { id: string; kind: "dependents" | "events"; title: string; hint?: string };

const LIFE_CARDS: Card[] = [
  { id: "age", kind: "single", title: "How old are you?", options: [
    [18, "Under 20"], [22, "20–24"], [27, "25–29"], [35, "30–39"], [45, "40–49"], [57, "50–64"], [68, "65+"],
  ].map(([v, l]) => opt("age", v as number, l as string)) },
  { id: "work", kind: "single", title: "Hours of paid work a week?", options: [
    opt("workHoursPerWeek", "0", "None"), opt("workHoursPerWeek", "<20", "Under 20"), opt("workHoursPerWeek", "20-40", "20 to 40"),
    opt("workHoursPerWeek", "40-50", "40 to 50"), opt("workHoursPerWeek", "50+", "More than 50"),
  ] },
  { id: "shift", kind: "single", title: "Do you work nights or rotating shifts?", options: [
    opt("shiftWork", true, "Yes"), opt("shiftWork", false, "No"),
  ] },
  { id: "commute", kind: "single", title: "How long is your commute, one way?", options: [
    opt("commuteMinutesOneWay", "0-15", "Under 15 min", "or none"), opt("commuteMinutesOneWay", "15-45", "15 to 45 min"),
    opt("commuteMinutesOneWay", "45-90", "45 to 90 min"), opt("commuteMinutesOneWay", "90+", "Over 90 min"),
  ] },
  { id: "dependents", kind: "dependents", title: "Who depends on you?" },
  { id: "support", kind: "single", title: "How many people can you count on?", options: [
    opt("support", 0, "No one right now"), opt("support", 1, "One"), opt("support", 2, "Two or three"),
    opt("support", 3, "A handful"), opt("support", 4, "Plenty"),
  ] },
  { id: "transport", kind: "single", title: "How do you usually get around?", options: [
    opt("transport", "car", "Car"), opt("transport", "transit", "Public transit"), opt("transport", "bike", "Bike"),
    opt("transport", "walk_only", "On foot"),
  ] },
  { id: "events", kind: "events", title: "Anything big in the last 12 months?", hint: "Pick any that apply." },
];

const SENSITIVE_CARDS: Card[] = [
  { id: "income", kind: "single", title: "How steady is your income?", options: [
    opt("income", "stable", "Steady"), opt("income", "variable", "It varies"), opt("income", "precarious", "Uncertain"),
  ] },
  { id: "debt", kind: "single", title: "How much does money weigh on you?", options: [
    opt("debtStress", 0, "Not at all"), opt("debtStress", 1, "A little"), opt("debtStress", 2, "Some"),
    opt("debtStress", 3, "A lot"), opt("debtStress", 4, "Constantly"),
  ] },
  { id: "health", kind: "single", title: "Does your health limit what you can do?", options: [
    opt("healthLimit", "none", "No"), opt("healthLimit", "mild", "A little"), opt("healthLimit", "significant", "Significantly"),
  ] },
  { id: "sleep", kind: "single", title: "How much do you sleep on a normal night?", options: [
    opt("sleepHours", "<5", "Under 5 hours"), opt("sleepHours", "5-6", "5 to 6 hours"), opt("sleepHours", "6-7", "6 to 7 hours"),
    opt("sleepHours", "7+", "7 hours or more"),
  ] },
];

const EVENTS: [LifeEvent, string][] = [
  ["bereavement", "Lost someone close"], ["divorce_breakup", "Breakup or divorce"], ["job_loss", "Lost a job"],
  ["new_baby", "New baby"], ["serious_illness", "Serious illness"], ["caring_crisis", "Caring for someone in crisis"],
  ["move", "Moved home"], ["new_job", "Started a new job"], ["exams", "Big exams"],
];

const CLASS_INFO: Record<ClassCode, { name: string; blurb: string }> = {
  warrior: { name: "Warrior", blurb: "Strength, endurance, the body as the main stat." },
  artisan: { name: "Artisan", blurb: "Making things: code, craft, art, anything with your hands." },
  merchant: { name: "Merchant", blurb: "Money, career, building something that pays." },
  bard: { name: "Bard", blurb: "People: friends, family, the room you walk into." },
  sage: { name: "Sage", blurb: "Mind: learning, calm, the inner game." },
};

const SKILL_NAME: Record<SkillCode, string> = {
  vitality: "Vitality", craft: "Craft", wealth: "Wealth", charisma: "Charisma", mindset: "Mindset",
};

const MODE_NAME: Record<DifficultyMode, string> = { peaceful: "Peaceful", normal: "Normal", hard: "Hard", hardcore: "Hardcore" };
// Pillar 4 copy rule: never "you have it hard", always what it means for the player's XP.
const MODE_LINE: Record<DifficultyMode, string> = {
  peaceful: "Gentle rules and room to build habits.",
  normal: "The standard rules. Every quest pays its full value.",
  hard: "Every quest you finish here counts for more.",
  hardcore: "Every quest you finish here counts for a lot more.",
};

type Step =
  | { kind: "splash" } | { kind: "class" } | { kind: "card"; card: Card; n: number; of: number }
  | { kind: "consent" } | { kind: "backstory" } | { kind: "reveal" } | { kind: "levelup" };

export function Onboarding({ onDone }: { onDone: (name: string, answers: A) => void }) {
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<A>(SKIPPED);
  const [classPicked, setClassPicked] = useState(false);
  const [sensitive, setSensitive] = useState(true);
  const [i, setI] = useState(0);

  const steps = useMemo<Step[]>(() => {
    const cards = sensitive ? [...LIFE_CARDS, ...SENSITIVE_CARDS] : LIFE_CARDS;
    const cardSteps = cards.map((card, n) => ({ kind: "card" as const, card, n, of: cards.length }));
    const before = cardSteps.slice(0, LIFE_CARDS.length);
    const after = cardSteps.slice(LIFE_CARDS.length);
    return [
      { kind: "splash" }, { kind: "class" }, ...before, { kind: "consent" }, ...after,
      { kind: "backstory" }, { kind: "reveal" }, { kind: "levelup" },
    ];
  }, [sensitive]);

  const step = steps[i];
  const next = () => setI(x => Math.min(steps.length - 1, x + 1));
  const back = () => setI(x => Math.max(0, x - 1));
  const set = (f: (a: A) => A) => setAnswers(f);

  let body: React.ReactNode;
  switch (step.kind) {
    case "splash": body = <Splash name={name} setName={setName} onNext={next} />; break;
    case "class": body = (
      <ClassSelect value={classPicked ? answers.focusClass : null}
        onPick={c => { set(a => ({ ...a, focusClass: c })); setClassPicked(true); next(); }} />
    ); break;
    case "card": body = <CardView card={step.card} answers={answers} set={set} onNext={next} />; break;
    case "consent": body = (
      <Consent
        onYes={() => { setSensitive(true); next(); }}
        onSkip={() => {
          // Skipping the block scores those four as zero load, same as skipping each card.
          setSensitive(false);
          set(a => ({ ...a, income: SKIPPED.income, debtStress: SKIPPED.debtStress, healthLimit: SKIPPED.healthLimit, sleepHours: SKIPPED.sleepHours }));
          setI(steps.findIndex(s => s.kind === "consent") + 1);
        }} />
    ); break;
    case "backstory": body = <Backstory answers={answers} set={set} onNext={next} />; break;
    case "reveal": body = <Reveal answers={answers} set={set} onNext={next} />; break;
    case "levelup": body = <LevelUp answers={answers} onDone={() => onDone(name, answers)} />; break;
  }

  const skippable = step.kind === "card";
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        {i > 0 && step.kind !== "levelup" ? (
          <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.topLink}>‹ Back</Text>
          </Pressable>
        ) : <View />}
        {step.kind === "card" && <Pips n={step.n} of={step.of} />}
        {skippable ? (
          <Pressable onPress={next} hitSlop={12} accessibilityRole="button"><Text style={styles.topLink}>Skip</Text></Pressable>
        ) : <View />}
      </View>
      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  );
}

// ---------- Steps ----------

function Splash({ name, setName, onNext }: { name: string; setName: (s: string) => void; onNext: () => void }) {
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.center}>
        <Text style={styles.kicker}>LIFE QUEST</Text>
        <Text style={styles.hero}>Your life is the open world.</Text>
        <Text style={styles.lead}>A few questions set your class, your difficulty and your starting level. About three minutes.</Text>
      </View>
      <TextInput
        style={styles.input} value={name} onChangeText={setName} placeholder="What should we call you?"
        placeholderTextColor={color.textFaint} autoCapitalize="words" returnKeyType="next" maxLength={24}
        onSubmitEditing={() => name.trim() && onNext()}
      />
      <Button label="Create your character" disabled={!name.trim()} onPress={onNext} />
    </KeyboardAvoidingView>
  );
}

function ClassSelect({ value, onPick }: { value: ClassCode | null; onPick: (c: ClassCode) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Choose your class</Text>
      <Text style={styles.hint}>Your class skill earns 5% more XP. Every skill stays open to you.</Text>
      {(Object.keys(CLASSES) as ClassCode[]).map(c => {
        const skill = CLASSES[c].skill;
        const on = value === c;
        return (
          <Pressable key={c} onPress={() => onPick(c)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[styles.classCard, { borderColor: on ? skillColor[skill] : color.panelBorder }]}>
            <View style={[styles.classStripe, { backgroundColor: skillColor[skill] }]} />
            <View style={styles.fill}>
              <View style={styles.rowBetween}>
                <Text style={styles.className}>{CLASS_INFO[c].name}</Text>
                <Text style={[styles.classBonus, { color: skillColor[skill] }]}>+5% {SKILL_NAME[skill]}</Text>
              </View>
              <Text style={styles.classBlurb}>{CLASS_INFO[c].blurb}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CardView({ card, answers, set, onNext }: { card: Card; answers: A; set: (f: (a: A) => A) => void; onNext: () => void }) {
  return (
    <ScrollView contentContainerStyle={[styles.scroll, styles.cardScroll]}>
      <Text style={styles.title}>{card.title}</Text>
      {card.hint && <Text style={styles.hint}>{card.hint}</Text>}
      <View style={styles.options}>
        {card.kind === "single" && card.options.map(o => (
          <Choice key={o.label} label={o.label} sub={o.sub} on={o.selected(answers)}
            onPress={() => { set(o.apply); onNext(); }} />
        ))}
        {card.kind === "dependents" && <Dependents answers={answers} set={set} onNext={onNext} />}
        {card.kind === "events" && <Events answers={answers} set={set} onNext={onNext} />}
      </View>
    </ScrollView>
  );
}

function Dependents({ answers, set, onNext }: { answers: A; set: (f: (a: A) => A) => void; onNext: () => void }) {
  const d = answers.dependents;
  const upd = (patch: Partial<A["dependents"]>) => set(a => ({ ...a, dependents: { ...a.dependents, ...patch } }));
  return (
    <>
      <Stepper label="Kids under 5" value={d.childrenUnder5} onChange={v => upd({ childrenUnder5: v })} />
      <Stepper label="Kids 5 and older" value={d.childrenOlder} onChange={v => upd({ childrenOlder: v })} />
      <Choice label="I care for an adult" sub="a parent, partner or relative" on={d.caregivingAdult}
        onPress={() => upd({ caregivingAdult: !d.caregivingAdult })} />
      <Button label="Continue" onPress={onNext} />
    </>
  );
}

function Events({ answers, set, onNext }: { answers: A; set: (f: (a: A) => A) => void; onNext: () => void }) {
  const has = (e: LifeEvent) => answers.lifeEvents12m.includes(e);
  const toggle = (e: LifeEvent) => set(a => ({
    ...a, lifeEvents12m: has(e) ? a.lifeEvents12m.filter(x => x !== e) : [...a.lifeEvents12m, e],
  }));
  return (
    <>
      <View style={styles.chips}>
        {EVENTS.map(([e, label]) => <Chip key={e} label={label} on={has(e)} onPress={() => toggle(e)} />)}
      </View>
      <Button label={answers.lifeEvents12m.length ? "Continue" : "None of these"} onPress={onNext} />
    </>
  );
}

function Consent({ onYes, onSkip }: { onYes: () => void; onSkip: () => void }) {
  return (
    <View style={styles.fill}>
      <View style={styles.center}>
        <Text style={styles.title}>Four about money and health</Text>
        <Text style={styles.lead}>
          They help set your difficulty fairly. Your answers stay on this phone; only the resulting difficulty is ever shared.
        </Text>
      </View>
      <View style={styles.twoButtons}>
        <View style={styles.fill}><Button label="Skip these" secondary onPress={onSkip} /></View>
        <View style={styles.fill}><Button label="Answer them" onPress={onYes} /></View>
      </View>
    </View>
  );
}

function Backstory({ answers, set, onNext }: { answers: A; set: (f: (a: A) => A) => void; onNext: () => void }) {
  const xp = backstoryXp(answers).total;
  const toggle = (c: AchievementCode) => set(a => ({
    ...a, achievements: a.achievements.includes(c) ? a.achievements.filter(x => x !== c) : [...a.achievements, c],
  }));
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Your backstory</Text>
        <Text style={styles.hint}>What have you already done? Each one is XP you start with.</Text>
        {SKILLS.map(skill => (
          <View key={skill} style={styles.group}>
            <Text style={[styles.groupLabel, { color: skillColor[skill] }]}>{SKILL_NAME[skill].toUpperCase()}</Text>
            <View style={styles.chips}>
              {(Object.keys(ACHIEVEMENTS) as AchievementCode[]).filter(c => ACHIEVEMENTS[c].skill === skill).map(c => (
                <Chip key={c} label={ACHIEVEMENTS[c].label} on={answers.achievements.includes(c)} tint={skillColor[skill]}
                  onPress={() => toggle(c)} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.counter}><Text style={styles.counterXp}>{xp.toLocaleString()} XP</Text> to start with</Text>
        <Button label="Continue" onPress={onNext} />
      </View>
    </View>
  );
}

function Reveal({ answers, set, onNext }: { answers: A; set: (f: (a: A) => A) => void; onNext: () => void }) {
  const c = calibrate(answers);
  const calibratedIdx = MODE_ORDER.indexOf(c.calibratedMode);
  const why = c.constraints.slice(0, 3);
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.kicker}>YOUR WORLD IS ON</Text>
        <Text style={styles.modeName}>{MODE_NAME[c.calibratedMode]}</Text>
        <Text style={styles.lead}>{MODE_LINE[c.calibratedMode]}</Text>

        <View style={styles.gaugeRow}>
          <Text style={styles.hint}>Life load</Text>
          <Text style={styles.gaugeNum}>{c.lifeLoad.total} / 100</Text>
        </View>
        <View style={styles.track}><View style={[styles.gaugeFill, { width: `${c.lifeLoad.total}%` }]} /></View>
        <Text style={styles.why}>
          {why.length ? `Set by: ${why.join(", ")}.` : "Plenty of room in your life to push."}
        </Text>

        <Text style={[styles.groupLabel, styles.modesLabel]}>PLAY ON</Text>
        {MODE_ORDER.map((m, idx) => {
          // Any easier mode, or one step harder (pillar 4 §4). Harder changes the rules, not the XP.
          if (idx > calibratedIdx + 1) return null;
          const on = (answers.preferredMode ?? c.calibratedMode) === m;
          const xpMode = MODE_ORDER[Math.min(idx, calibratedIdx)];
          const sub = idx > calibratedIdx
            ? `Stricter streaks, XP stays ×${DIFFICULTY_MULT[xpMode].toFixed(1)}`
            : `XP ×${DIFFICULTY_MULT[xpMode].toFixed(1)}${idx === calibratedIdx ? " · recommended" : ""}`;
          return <Choice key={m} label={MODE_NAME[m]} sub={sub} on={on} onPress={() => set(a => ({ ...a, preferredMode: m }))} />;
        })}
      </ScrollView>
      <View style={styles.footer}><Button label="Continue" onPress={onNext} /></View>
    </View>
  );
}

function LevelUp({ answers, onDone }: { answers: A; onDone: () => void }) {
  const c = calibrate(answers);
  const total = c.backstory.total;
  const anim = useRef(new Animated.Value(0)).current;
  const [xp, setXp] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setXp(Math.round(value)));
    Animated.timing(anim, {
      toValue: total, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [anim, total]);

  const p = playerLevels.progress(xp);
  return (
    <Pressable style={styles.fill} onPress={() => anim.stopAnimation(() => { anim.setValue(total); setXp(total); })}>
      <View style={styles.center}>
        <Text style={styles.kicker}>{CLASS_INFO[answers.focusClass].name.toUpperCase()} · {MODE_NAME[c.rulesMode].toUpperCase()}</Text>
        <View style={styles.bigBadge}>
          <Text style={styles.badgeLabel}>LV</Text>
          <Text style={styles.bigLevel}>{p.level}</Text>
        </View>
        <View style={[styles.track, styles.levelTrack]}><View style={[styles.xpFill, { width: `${p.pct * 100}%` }]} /></View>
        <Text style={styles.hint}>{xp.toLocaleString()} XP from your backstory</Text>
        <View style={styles.skillRow}>
          {SKILLS.map(s => (
            <View key={s} style={styles.skillCell}>
              <Text style={[styles.skillCode, { color: skillColor[s] }]}>{skillLabel[s]}</Text>
              <Text style={styles.skillLevel}>{skillLevels.levelFor(Math.round(c.backstory.perSkill[s] * (total ? xp / total : 1)))}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.why}>Finishing this gives you your first quest reward: +{CREATION_QUEST.xp} XP.</Text>
      </View>
      <Button label="Enter the world" onPress={onDone} />
    </Pressable>
  );
}

// ---------- Pieces ----------

function Pips({ n, of }: { n: number; of: number }) {
  return (
    <View style={styles.pips} accessibilityLabel={`Question ${n + 1} of ${of}`}>
      {Array.from({ length: of }, (_, k) => <View key={k} style={[styles.pip, k <= n && styles.pipOn]} />)}
    </View>
  );
}

function Choice({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.pressed]}>
      <Text style={[styles.choiceLabel, on && styles.choiceLabelOn]}>{label}</Text>
      {sub && <Text style={styles.choiceSub}>{sub}</Text>}
    </Pressable>
  );
}

function Chip({ label, on, tint = color.xp, onPress }: { label: string; on: boolean; tint?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.chip, on && { borderColor: tint, backgroundColor: `${tint}22` }]}>
      <Text style={[styles.chipText, on && { color: color.text }]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={[styles.choice, styles.rowBetween]}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} hitSlop={8} style={styles.stepBtn} accessibilityLabel={`Fewer ${label}`}>
          <Text style={styles.stepTxt}>−</Text>
        </Pressable>
        <Text style={styles.stepVal}>{value}{value >= 4 ? "+" : ""}</Text>
        <Pressable onPress={() => onChange(Math.min(4, value + 1))} hitSlop={8} style={styles.stepBtn} accessibilityLabel={`More ${label}`}>
          <Text style={styles.stepTxt}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Button({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },
  center: { flex: 1, justifyContent: "center", gap: 12 },
  scroll: { paddingBottom: 24, gap: 10 },
  cardScroll: { flexGrow: 1, justifyContent: "flex-end" },
  topBar: { height: 44, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topLink: { color: color.textDim, fontSize: 15, minWidth: 56 },
  kicker: { color: color.xp, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  hero: { color: color.text, fontSize: 34, fontWeight: "800", lineHeight: 40 },
  lead: { color: color.textDim, fontSize: 16, lineHeight: 22 },
  title: { color: color.text, fontSize: 26, fontWeight: "800", lineHeight: 32, marginTop: 8 },
  hint: { color: color.textDim, fontSize: 14 },
  options: { gap: 10, marginTop: 14 },
  input: {
    color: color.text, fontSize: 18, padding: 16, borderRadius: 14, marginBottom: 12,
    backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  choice: {
    paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
    backgroundColor: color.panel, borderWidth: 1, borderColor: color.panelBorder,
  },
  choiceOn: { borderColor: color.xp, backgroundColor: "rgba(245, 196, 81, 0.10)" },
  choiceLabel: { color: color.text, fontSize: 17, fontWeight: "600" },
  choiceLabelOn: { color: color.xp },
  choiceSub: { color: color.textDim, fontSize: 13, marginTop: 2 },
  pressed: { opacity: 0.7 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: color.track },
  stepTxt: { color: color.text, fontSize: 20, fontWeight: "700", marginTop: -2 },
  stepVal: { color: color.text, fontSize: 17, fontWeight: "700", minWidth: 22, textAlign: "center", fontVariant: ["tabular-nums"] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999,
    backgroundColor: color.panel, borderWidth: 1, borderColor: color.panelBorder,
  },
  chipText: { color: color.textDim, fontSize: 14 },
  group: { gap: 8, marginTop: 8 },
  groupLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: color.textDim },
  classCard: {
    flexDirection: "row", gap: 14, padding: 16, borderRadius: 16, borderWidth: 1.5,
    backgroundColor: color.panel, overflow: "hidden",
  },
  classStripe: { width: 4, borderRadius: 2 },
  className: { color: color.text, fontSize: 19, fontWeight: "800" },
  classBonus: { fontSize: 13, fontWeight: "700" },
  classBlurb: { color: color.textDim, fontSize: 14, marginTop: 4, lineHeight: 19 },
  twoButtons: { flexDirection: "row", gap: 10 },
  footer: { gap: 10, paddingTop: 8 },
  counter: { color: color.textDim, fontSize: 14, textAlign: "center" },
  counterXp: { color: color.xp, fontWeight: "800" },
  modeName: { color: color.text, fontSize: 44, fontWeight: "900", marginTop: -4 },
  gaugeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  gaugeNum: { color: color.text, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 4, backgroundColor: color.track, overflow: "hidden" },
  gaugeFill: { height: 8, backgroundColor: color.xp },
  why: { color: color.textDim, fontSize: 14, lineHeight: 20, marginTop: 6 },
  modesLabel: { marginTop: 18 },
  bigBadge: {
    alignSelf: "center", width: 112, height: 112, borderRadius: 28, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: color.xp, backgroundColor: "rgba(245, 196, 81, 0.08)", marginVertical: 12,
  },
  badgeLabel: { color: color.xp, fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  bigLevel: { color: color.text, fontSize: 52, fontWeight: "900", marginTop: -4, fontVariant: ["tabular-nums"] },
  levelTrack: { height: 10, borderRadius: 5 },
  xpFill: { height: 10, backgroundColor: color.xp },
  skillRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  skillCell: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)" },
  skillCode: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  skillLevel: { color: color.text, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  pips: { flexDirection: "row", gap: 4 },
  pip: { width: 14, height: 4, borderRadius: 2, backgroundColor: color.track },
  pipOn: { backgroundColor: color.xp },
  button: { paddingVertical: 16, borderRadius: 14, alignItems: "center", backgroundColor: color.xp },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.panelBorder },
  buttonText: { color: color.bg, fontSize: 17, fontWeight: "800" },
  buttonTextSecondary: { color: color.text },
  disabled: { opacity: 0.4 },
});
