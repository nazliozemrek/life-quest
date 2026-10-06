// Character creation (pillar 4 flow A–H). One question per card, every Life Load card skippable,
// health and money behind a consent card, then the difficulty reveal and the starting-level fill.
// Goals (E) and places (F) sit between the backstory and the reveal.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ACHIEVEMENTS, CLASSES, MODE_ORDER, backstoryXp, calibrate,
  type AchievementCode, type ClassCode, type LifeEvent, type OnboardingAnswers,
} from "../../../../src/onboarding/calibration";
import { DIFFICULTY_MULT, playerLevels, skillLevels, type DifficultyMode, type SkillCode } from "../../../../src/xp/xp-engine";
import { CREATION_QUEST, SKIPPED } from "../../game/onboarding";
import type { Fix } from "../../../../src/spatial/spatial-engine";
import type { Goal, Place } from "../../game/setup";
import { Button, Chip, Choice, useKeyboardInset } from "./parts";
import { GoalsStep, PlacesStep } from "./Setup";
import { SKILLS } from "../../game/session";
import { color, skillColor } from "../theme";
import { useSettings, useT } from "../settings";
import type { Key, Lang } from "../../i18n";

type A = OnboardingAnswers;
interface Option { label: Key; sub?: Key; apply: (a: A) => A; selected: (a: A) => boolean }

/** One single-choice option that sets one answer field. Labels are i18n keys, translated at render. */
function opt<K extends keyof A>(field: K, value: A[K], label: Key, sub?: Key): Option {
  return { label, sub, apply: a => ({ ...a, [field]: value }), selected: a => a[field] === value };
}

type Card =
  | { id: string; kind: "single"; title: Key; hint?: Key; options: Option[] }
  | { id: string; kind: "dependents" | "events"; title: Key; hint?: Key };

const LIFE_CARDS: Card[] = [
  { id: "age", kind: "single", title: "ob.card.age.title", options: ([
    [18, "ob.card.age.opt.18"], [22, "ob.card.age.opt.22"], [27, "ob.card.age.opt.27"], [35, "ob.card.age.opt.35"],
    [45, "ob.card.age.opt.45"], [57, "ob.card.age.opt.57"], [68, "ob.card.age.opt.68"],
  ] as [number, Key][]).map(([v, l]) => opt("age", v, l)) },
  { id: "work", kind: "single", title: "ob.card.work.title", options: [
    opt("workHoursPerWeek", "0", "ob.card.work.opt.none"), opt("workHoursPerWeek", "<20", "ob.card.work.opt.under20"),
    opt("workHoursPerWeek", "20-40", "ob.card.work.opt.20to40"), opt("workHoursPerWeek", "40-50", "ob.card.work.opt.40to50"),
    opt("workHoursPerWeek", "50+", "ob.card.work.opt.over50"),
  ] },
  { id: "shift", kind: "single", title: "ob.card.shift.title", options: [
    opt("shiftWork", true, "ob.card.shift.opt.yes"), opt("shiftWork", false, "ob.card.shift.opt.no"),
  ] },
  { id: "commute", kind: "single", title: "ob.card.commute.title", options: [
    opt("commuteMinutesOneWay", "0-15", "ob.card.commute.opt.0-15", "ob.card.commute.opt.0-15.sub"),
    opt("commuteMinutesOneWay", "15-45", "ob.card.commute.opt.15-45"),
    opt("commuteMinutesOneWay", "45-90", "ob.card.commute.opt.45-90"), opt("commuteMinutesOneWay", "90+", "ob.card.commute.opt.90+"),
  ] },
  { id: "dependents", kind: "dependents", title: "ob.card.dependents.title" },
  { id: "support", kind: "single", title: "ob.card.support.title", options: [
    opt("support", 0, "ob.card.support.opt.0"), opt("support", 1, "ob.card.support.opt.1"), opt("support", 2, "ob.card.support.opt.2"),
    opt("support", 3, "ob.card.support.opt.3"), opt("support", 4, "ob.card.support.opt.4"),
  ] },
  { id: "transport", kind: "single", title: "ob.card.transport.title", options: [
    opt("transport", "car", "ob.card.transport.opt.car"), opt("transport", "transit", "ob.card.transport.opt.transit"),
    opt("transport", "bike", "ob.card.transport.opt.bike"), opt("transport", "walk_only", "ob.card.transport.opt.walk"),
  ] },
  { id: "events", kind: "events", title: "ob.card.events.title", hint: "ob.card.events.hint" },
];

const SENSITIVE_CARDS: Card[] = [
  { id: "income", kind: "single", title: "ob.card.income.title", options: [
    opt("income", "stable", "ob.card.income.opt.stable"), opt("income", "variable", "ob.card.income.opt.variable"),
    opt("income", "precarious", "ob.card.income.opt.precarious"),
  ] },
  { id: "debt", kind: "single", title: "ob.card.debt.title", options: [
    opt("debtStress", 0, "ob.card.debt.opt.0"), opt("debtStress", 1, "ob.card.debt.opt.1"), opt("debtStress", 2, "ob.card.debt.opt.2"),
    opt("debtStress", 3, "ob.card.debt.opt.3"), opt("debtStress", 4, "ob.card.debt.opt.4"),
  ] },
  { id: "health", kind: "single", title: "ob.card.health.title", options: [
    opt("healthLimit", "none", "ob.card.health.opt.none"), opt("healthLimit", "mild", "ob.card.health.opt.mild"),
    opt("healthLimit", "significant", "ob.card.health.opt.significant"),
  ] },
  { id: "sleep", kind: "single", title: "ob.card.sleep.title", options: [
    opt("sleepHours", "<5", "ob.card.sleep.opt.lt5"), opt("sleepHours", "5-6", "ob.card.sleep.opt.5-6"),
    opt("sleepHours", "6-7", "ob.card.sleep.opt.6-7"), opt("sleepHours", "7+", "ob.card.sleep.opt.7+"),
  ] },
];

const EVENTS: [LifeEvent, Key][] = [
  ["bereavement", "ob.event.bereavement"], ["divorce_breakup", "ob.event.divorce_breakup"], ["job_loss", "ob.event.job_loss"],
  ["new_baby", "ob.event.new_baby"], ["serious_illness", "ob.event.serious_illness"], ["caring_crisis", "ob.event.caring_crisis"],
  ["move", "ob.event.move"], ["new_job", "ob.event.new_job"], ["exams", "ob.event.exams"],
];

const CLASS_INFO: Record<ClassCode, { name: Key; blurb: Key }> = {
  warrior: { name: "class.warrior", blurb: "ob.class.warrior.blurb" },
  artisan: { name: "class.artisan", blurb: "ob.class.artisan.blurb" },
  merchant: { name: "class.merchant", blurb: "ob.class.merchant.blurb" },
  bard: { name: "class.bard", blurb: "ob.class.bard.blurb" },
  sage: { name: "class.sage", blurb: "ob.class.sage.blurb" },
};

const SKILL_NAME: Record<SkillCode, Key> = {
  vitality: "skill.vitality", craft: "skill.craft", wealth: "skill.wealth", charisma: "skill.charisma", mindset: "skill.mindset",
};

const SKILL_SHORT: Record<SkillCode, Key> = {
  vitality: "skillShort.vitality", craft: "skillShort.craft", wealth: "skillShort.wealth",
  charisma: "skillShort.charisma", mindset: "skillShort.mindset",
};

const ACHIEVEMENT_LABEL: Record<AchievementCode, Key> = {
  degree: "ob.ach.degree", trade_cert: "ob.ach.trade_cert", endurance_race: "ob.ach.endurance_race",
  regular_training_1y: "ob.ach.regular_training_1y", quit_addiction: "ob.ach.quit_addiction",
  built_something: "ob.ach.built_something", learned_language: "ob.ach.learned_language",
  creative_work_shared: "ob.ach.creative_work_shared", emergency_fund: "ob.ach.emergency_fund", debt_free: "ob.ach.debt_free",
  career_promotion: "ob.ach.career_promotion", started_business: "ob.ach.started_business",
  public_speaking: "ob.ach.public_speaking", led_team: "ob.ach.led_team", long_friendships: "ob.ach.long_friendships",
  therapy_or_meditation_habit: "ob.ach.therapy_or_meditation_habit", raised_children: "ob.ach.raised_children",
  overcame_hardship: "ob.ach.overcame_hardship",
};

// calibrate() returns its constraint tags as English text (they also feed the quest generator). The reveal shows them
// to the player, so map each known tag to a key; an unknown tag falls back to its English text.
const CONSTRAINT_LABEL: Record<string, Key> = {
  "works night or rotating shifts": "ob.why.shift",
  "very long work hours": "ob.why.longHours",
  "long commute": "ob.why.commute",
  "young children at home": "ob.why.youngKids",
  "caregiver for an adult": "ob.why.caregiver",
  "tight budget, prefer free activities": "ob.why.budget",
  "health limits physical activity, keep vitality quests gentle": "ob.why.healthSignificant",
  "some physical limitations": "ob.why.healthMild",
  "short on sleep": "ob.why.sleep",
  "no vehicle, keep locations walkable": "ob.why.walk",
  "no car, uses public transit": "ob.why.transit",
  "going through a hard period, favor gentle and restorative quests": "ob.why.hardPeriod",
};

const MODE_NAME: Record<DifficultyMode, Key> = { peaceful: "mode.peaceful", normal: "mode.normal", hard: "mode.hard", hardcore: "mode.hardcore" };
// Pillar 4 copy rule: never "you have it hard", always what it means for the player's XP.
const MODE_LINE: Record<DifficultyMode, Key> = {
  peaceful: "ob.mode.peaceful.line",
  normal: "ob.mode.normal.line",
  hard: "ob.mode.hard.line",
  hardcore: "ob.mode.hardcore.line",
};

/** Upper-case for kickers. Turkish needs its dotted/dotless i (i → İ, ı → I), which plain toUpperCase gets wrong. */
function caps(s: string, lang: Lang): string {
  return lang === "tr" ? s.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase() : s.toUpperCase();
}

/** A multiplier like 1.5 as "1.5" in English and "1,5" in Turkish. */
function mult(x: number, lang: Lang): string {
  const s = x.toFixed(1);
  return lang === "tr" ? s.replace(".", ",") : s;
}

type Step =
  | { kind: "splash" } | { kind: "class" } | { kind: "card"; card: Card; n: number; of: number }
  | { kind: "consent" } | { kind: "backstory" } | { kind: "goals" } | { kind: "places" } | { kind: "reveal" } | { kind: "levelup" };

export function Onboarding({ onDone, onRestore, explored, position }: {
  onDone: (name: string, answers: A, goals: Goal[], places: Place[]) => void; explored: ReadonlySet<string>; position: Fix;
  onRestore?: () => void;          // "I already have a character": only when the build can reach the backend
}) {
  const [name, setName] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [answers, setAnswers] = useState<A>(SKIPPED);
  const [classPicked, setClassPicked] = useState(false);
  const [sensitive, setSensitive] = useState(true);
  // Cards start on the zero-load answers so a skip scores right, but nothing shows as chosen until the player taps.
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const [i, setI] = useState(0);
  const t = useT();

  const steps = useMemo<Step[]>(() => {
    const cards = sensitive ? [...LIFE_CARDS, ...SENSITIVE_CARDS] : LIFE_CARDS;
    const cardSteps = cards.map((card, n) => ({ kind: "card" as const, card, n, of: cards.length }));
    const before = cardSteps.slice(0, LIFE_CARDS.length);
    const after = cardSteps.slice(LIFE_CARDS.length);
    return [
      { kind: "splash" }, { kind: "class" }, ...before, { kind: "consent" }, ...after,
      { kind: "backstory" }, { kind: "goals" }, { kind: "places" }, { kind: "reveal" }, { kind: "levelup" },
    ];
  }, [sensitive]);

  const step = steps[i];
  const next = () => setI(x => Math.min(steps.length - 1, x + 1));
  const back = () => setI(x => Math.max(0, x - 1));
  const set = (f: (a: A) => A) => setAnswers(f);

  let body: React.ReactNode;
  switch (step.kind) {
    case "splash": body = <Splash name={name} setName={setName} onNext={next} onRestore={onRestore} />; break;
    case "class": body = (
      <ClassSelect value={classPicked ? answers.focusClass : null}
        onPick={c => { set(a => ({ ...a, focusClass: c })); setClassPicked(true); next(); }} />
    ); break;
    case "card": {
      const id = step.card.id;
      body = (
        <CardView card={step.card} answers={answers} answered={answered.has(id)} onNext={next}
          set={f => { set(f); setAnswered(a => new Set(a).add(id)); }} />
      );
      break;
    }
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
    case "goals": body = <GoalsStep goals={goals} setGoals={setGoals} onNext={next} />; break;
    case "places": body = <PlacesStep places={places} setPlaces={setPlaces} explored={explored} position={position} onNext={next} />; break;
    case "reveal": body = <Reveal answers={answers} set={set} onNext={next} />; break;
    case "levelup": body = <LevelUp answers={answers} onDone={() => onDone(name, answers, goals, places)} />; break;
  }

  const skippable = step.kind === "card";
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        {i > 0 && step.kind !== "levelup" ? (
          <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("ob.back.a11y")}>
            <Text style={styles.topLink}>{t("common.back")}</Text>
          </Pressable>
        ) : <View />}
        {step.kind === "card" && <Pips n={step.n} of={step.of} />}
        {skippable ? (
          <Pressable onPress={next} hitSlop={12} accessibilityRole="button"><Text style={styles.topLink}>{t("common.skip")}</Text></Pressable>
        ) : <View />}
      </View>
      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  );
}

// ---------- Steps ----------

function Splash({ name, setName, onNext, onRestore }: { name: string; setName: (s: string) => void; onNext: () => void; onRestore?: () => void }) {
  const keyboard = useKeyboardInset();
  const insets = useSafeAreaInsets();
  const open = keyboard > 0;
  const t = useT();
  return (
    // The screen already pads for the home indicator, so only the part of the keyboard above it needs clearing.
    <Pressable style={[styles.fill, { paddingBottom: open ? Math.max(0, keyboard - insets.bottom) : 0 }]}
      onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.center}>
        <Text style={styles.kicker}>{t("ob.splash.kicker")}</Text>
        <Text style={[styles.hero, open && styles.heroSmall]}>{t("ob.splash.title")}</Text>
        {!open && (
          <Text style={styles.lead}>{t("ob.splash.lead")}</Text>
        )}
      </View>
      <TextInput
        style={styles.input} value={name} onChangeText={setName} placeholder={t("ob.splash.namePlaceholder")}
        placeholderTextColor={color.textFaint} autoCapitalize="words" autoCorrect={false} textContentType="givenName"
        autoComplete="name-given" returnKeyType="go" maxLength={24} keyboardAppearance="dark"
        onSubmitEditing={() => name.trim() && onNext()} submitBehavior="blurAndSubmit"
      />
      <Button label={t("ob.splash.create")} disabled={!name.trim()} onPress={() => { Keyboard.dismiss(); onNext(); }} />
      {onRestore && !open && (
        <Pressable onPress={onRestore} hitSlop={8} accessibilityRole="button">
          <Text style={styles.restoreLink}>{t("account.haveCharacter")}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function ClassSelect({ value, onPick }: { value: ClassCode | null; onPick: (c: ClassCode) => void }) {
  const t = useT();
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>{t("ob.class.title")}</Text>
      <Text style={styles.hint}>{t("ob.class.hint")}</Text>
      {(Object.keys(CLASSES) as ClassCode[]).map(c => {
        const skill = CLASSES[c].skill;
        const on = value === c;
        return (
          <Pressable key={c} onPress={() => onPick(c)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[styles.classCard, { borderColor: on ? skillColor[skill] : color.panelBorder }]}>
            <View style={[styles.classStripe, { backgroundColor: skillColor[skill] }]} />
            <View style={styles.fill}>
              <View style={styles.rowBetween}>
                <Text style={styles.className}>{t(CLASS_INFO[c].name)}</Text>
                <Text style={[styles.classBonus, { color: skillColor[skill] }]}>{t("ob.class.bonus", { skill: t(SKILL_NAME[skill]) })}</Text>
              </View>
              <Text style={styles.classBlurb}>{t(CLASS_INFO[c].blurb)}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CardView({ card, answers, answered, set, onNext }: {
  card: Card; answers: A; answered: boolean; set: (f: (a: A) => A) => void; onNext: () => void;
}) {
  const t = useT();
  return (
    <ScrollView contentContainerStyle={[styles.scroll, styles.cardScroll]}>
      <Text style={styles.title}>{t(card.title)}</Text>
      {card.hint && <Text style={styles.hint}>{t(card.hint)}</Text>}
      <View style={styles.options}>
        {card.kind === "single" && card.options.map(o => (
          <Choice key={o.label} label={t(o.label)} sub={o.sub && t(o.sub)} on={answered && o.selected(answers)}
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
  const t = useT();
  return (
    <>
      <Stepper label={t("ob.card.dependents.under5")} value={d.childrenUnder5} onChange={v => upd({ childrenUnder5: v })} />
      <Stepper label={t("ob.card.dependents.older")} value={d.childrenOlder} onChange={v => upd({ childrenOlder: v })} />
      <Choice label={t("ob.card.dependents.adult")} sub={t("ob.card.dependents.adult.sub")} on={d.caregivingAdult}
        onPress={() => upd({ caregivingAdult: !d.caregivingAdult })} />
      <Button label={t("common.continue")} onPress={onNext} />
    </>
  );
}

function Events({ answers, set, onNext }: { answers: A; set: (f: (a: A) => A) => void; onNext: () => void }) {
  const t = useT();
  const has = (e: LifeEvent) => answers.lifeEvents12m.includes(e);
  const toggle = (e: LifeEvent) => set(a => ({
    ...a, lifeEvents12m: has(e) ? a.lifeEvents12m.filter(x => x !== e) : [...a.lifeEvents12m, e],
  }));
  return (
    <>
      <View style={styles.chips}>
        {EVENTS.map(([e, label]) => <Chip key={e} label={t(label)} on={has(e)} onPress={() => toggle(e)} />)}
      </View>
      <Button label={t(answers.lifeEvents12m.length ? "common.continue" : "ob.card.events.none")} onPress={onNext} />
    </>
  );
}

function Consent({ onYes, onSkip }: { onYes: () => void; onSkip: () => void }) {
  const t = useT();
  return (
    <View style={styles.fill}>
      <View style={styles.center}>
        <Text style={styles.title}>{t("ob.consent.title")}</Text>
        <Text style={styles.lead}>{t("ob.consent.lead")}</Text>
      </View>
      <View style={styles.twoButtons}>
        <View style={styles.fill}><Button label={t("ob.consent.skip")} secondary onPress={onSkip} /></View>
        <View style={styles.fill}><Button label={t("ob.consent.yes")} onPress={onYes} /></View>
      </View>
    </View>
  );
}

function Backstory({ answers, set, onNext }: { answers: A; set: (f: (a: A) => A) => void; onNext: () => void }) {
  const { t, settings: { lang } } = useSettings();
  const xp = backstoryXp(answers).total;
  // The XP figure is highlighted inside the sentence, so split the sentence around its {xp} slot.
  const [counterPre, counterPost = ""] = t("ob.backstory.counter").split("{xp}");
  const toggle = (c: AchievementCode) => set(a => ({
    ...a, achievements: a.achievements.includes(c) ? a.achievements.filter(x => x !== c) : [...a.achievements, c],
  }));
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t("ob.backstory.title")}</Text>
        <Text style={styles.hint}>{t("ob.backstory.hint")}</Text>
        {SKILLS.map(skill => (
          <View key={skill} style={styles.group}>
            <Text style={[styles.groupLabel, { color: skillColor[skill] }]}>{caps(t(SKILL_NAME[skill]), lang)}</Text>
            <View style={styles.chips}>
              {(Object.keys(ACHIEVEMENTS) as AchievementCode[]).filter(c => ACHIEVEMENTS[c].skill === skill).map(c => (
                <Chip key={c} label={t(ACHIEVEMENT_LABEL[c])} on={answers.achievements.includes(c)} tint={skillColor[skill]}
                  onPress={() => toggle(c)} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.counter}>
          {counterPre}<Text style={styles.counterXp}>{t("ob.xp", { n: xp.toLocaleString() })}</Text>{counterPost}
        </Text>
        <Button label={t("common.continue")} onPress={onNext} />
      </View>
    </View>
  );
}

function Reveal({ answers, set, onNext }: { answers: A; set: (f: (a: A) => A) => void; onNext: () => void }) {
  const { t, settings: { lang } } = useSettings();
  const c = calibrate(answers);
  const calibratedIdx = MODE_ORDER.indexOf(c.calibratedMode);
  const why = c.constraints.slice(0, 3);
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.kicker}>{t("ob.reveal.kicker")}</Text>
        <Text style={styles.modeName}>{t(MODE_NAME[c.calibratedMode])}</Text>
        <Text style={styles.lead}>{t(MODE_LINE[c.calibratedMode])}</Text>

        <View style={styles.gaugeRow}>
          <Text style={styles.hint}>{t("ob.reveal.lifeLoad")}</Text>
          <Text style={styles.gaugeNum}>{t("ob.reveal.gauge", { n: c.lifeLoad.total })}</Text>
        </View>
        <View style={styles.track}><View style={[styles.gaugeFill, { width: `${c.lifeLoad.total}%` }]} /></View>
        <Text style={styles.why}>
          {why.length
            ? t("ob.reveal.setBy", {
              list: why.map(w => (CONSTRAINT_LABEL[w] ? t(CONSTRAINT_LABEL[w]) : w)).join(t("ob.reveal.listSep")),
            })
            : t("ob.reveal.roomToPush")}
        </Text>

        <Text style={[styles.groupLabel, styles.modesLabel]}>{t("ob.reveal.playOn")}</Text>
        {MODE_ORDER.map((m, idx) => {
          // Any easier mode, or one step harder (pillar 4 §4). Harder changes the rules, not the XP.
          if (idx > calibratedIdx + 1) return null;
          const on = (answers.preferredMode ?? c.calibratedMode) === m;
          const xpMode = MODE_ORDER[Math.min(idx, calibratedIdx)];
          const x = mult(DIFFICULTY_MULT[xpMode], lang);
          const sub = idx > calibratedIdx
            ? t("ob.reveal.harder", { mode: t(MODE_NAME[MODE_ORDER[calibratedIdx]]), mult: x })
            : t(idx === calibratedIdx ? "ob.reveal.xpRecommended" : "ob.reveal.xp", { mult: x });
          return <Choice key={m} label={t(MODE_NAME[m])} sub={sub} on={on} onPress={() => set(a => ({ ...a, preferredMode: m }))} />;
        })}
      </ScrollView>
      <View style={styles.footer}><Button label={t("common.continue")} onPress={onNext} /></View>
    </View>
  );
}

function LevelUp({ answers, onDone }: { answers: A; onDone: () => void }) {
  const { t, settings: { lang } } = useSettings();
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
        <Text style={styles.kicker}>{caps(t(CLASS_INFO[answers.focusClass].name), lang)} · {caps(t(MODE_NAME[c.rulesMode]), lang)}</Text>
        <View style={styles.bigBadge}>
          <Text style={styles.badgeLabel}>{t("ob.levelup.lv")}</Text>
          <Text style={styles.bigLevel}>{p.level}</Text>
        </View>
        <View style={[styles.track, styles.levelTrack]}><View style={[styles.xpFill, { width: `${p.pct * 100}%` }]} /></View>
        <Text style={styles.hint}>{t("ob.levelup.fromBackstory", { xp: xp.toLocaleString() })}</Text>
        <View style={styles.skillRow}>
          {SKILLS.map(s => (
            <View key={s} style={styles.skillCell}>
              <Text style={[styles.skillCode, { color: skillColor[s] }]}>{t(SKILL_SHORT[s])}</Text>
              <Text style={styles.skillLevel}>{skillLevels.levelFor(Math.round(c.backstory.perSkill[s] * (total ? xp / total : 1)))}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.why}>{t("ob.levelup.firstReward", { xp: CREATION_QUEST.xp })}</Text>
      </View>
      <Button label={t("ob.levelup.enter")} onPress={onDone} />
    </Pressable>
  );
}

// ---------- Pieces ----------

function Pips({ n, of }: { n: number; of: number }) {
  const t = useT();
  return (
    <View style={styles.pips} accessibilityLabel={t("ob.pips.a11y", { n: n + 1, of })}>
      {Array.from({ length: of }, (_, k) => <View key={k} style={[styles.pip, k <= n && styles.pipOn]} />)}
    </View>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const t = useT();
  return (
    <View style={[styles.choice, styles.rowBetween]}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} hitSlop={8} style={styles.stepBtn} accessibilityLabel={t("ob.stepper.fewer.a11y", { label })}>
          <Text style={styles.stepTxt}>−</Text>
        </Pressable>
        <Text style={styles.stepVal}>{value}{value >= 4 ? "+" : ""}</Text>
        <Pressable onPress={() => onChange(Math.min(4, value + 1))} hitSlop={8} style={styles.stepBtn} accessibilityLabel={t("ob.stepper.more.a11y", { label })}>
          <Text style={styles.stepTxt}>+</Text>
        </Pressable>
      </View>
    </View>
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
  heroSmall: { fontSize: 26, lineHeight: 32 },
  lead: { color: color.textDim, fontSize: 16, lineHeight: 22 },
  restoreLink: { color: color.textDim, fontSize: 14, fontWeight: "600", textAlign: "center", paddingVertical: 14 },
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
