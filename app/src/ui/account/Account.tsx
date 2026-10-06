// Email backup (from the character sheet) and restore (from the first screen). Both are the same two steps:
// type your email, then the 6-digit code Supabase sends to it.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { say, type Msg } from "../../i18n";
import { backedUpEmail, confirmBackup, confirmRestore, startBackup, startRestore } from "../../net/account";
import type { SavedGame } from "../../game/persist";
import { supabase } from "../../net/supabase";
import { Button, useKeyboardInset } from "../onboarding/parts";
import { useT } from "../settings";
import { color } from "../theme";

/** Whether this build can back up at all (it has a Supabase project). */
export const ACCOUNTS_ENABLED = !!supabase;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Outcome = { ok: boolean; error?: Msg };

function EmailCode({ start, confirm, submitLabel }: {
  start(email: string): Promise<Outcome>;
  confirm(email: string, code: string): Promise<Outcome>;
  submitLabel: string;
}) {
  const t = useT();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Msg | null>(null);
  const valid = EMAIL.test(email.trim());

  const run = async (f: () => Promise<Outcome>, onOk?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const r = await f();
      if (r.ok) onOk?.();
      else setError(r.error ?? null);
    } finally {
      setBusy(false);
    }
  };
  const send = () => valid && run(() => start(email), () => setStep("code"));

  return (
    <View style={styles.form}>
      {step === "email" ? (
        <>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder={t("account.emailPlaceholder")}
            placeholderTextColor={color.textFaint} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            textContentType="emailAddress" autoComplete="email" keyboardAppearance="dark" returnKeyType="send"
            onSubmitEditing={send} />
          <Button label={t("account.sendCode")} disabled={busy || !valid} onPress={send} />
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t("account.codeSent", { email: email.trim() })}</Text>
          <TextInput style={[styles.input, styles.code]} value={code} onChangeText={s => setCode(s.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456" placeholderTextColor={color.textFaint} keyboardType="number-pad"
            textContentType="oneTimeCode" autoComplete="one-time-code" keyboardAppearance="dark" maxLength={6} />
          <Button label={submitLabel} disabled={busy || code.length !== 6} onPress={() => run(() => confirm(email, code))} />
          <Pressable onPress={() => { setStep("email"); setCode(""); setError(null); }} hitSlop={8}>
            <Text style={styles.link}>{t("account.changeEmail")}</Text>
          </Pressable>
        </>
      )}
      {busy && <ActivityIndicator color={color.xp} />}
      {error && <Text style={styles.error}>{say(t, error)}</Text>}
    </View>
  );
}

/** Character sheet section: "backed up as <email>", or the form to back up. */
export function BackupBox() {
  const t = useT();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => { backedUpEmail().then(setEmail).catch(() => setEmail(null)); }, []);

  if (email === undefined) return <ActivityIndicator color={color.xp} />;
  if (email) return <Text style={styles.done}>{t("account.backedUp", { email })}</Text>;
  return (
    <>
      <Text style={styles.hint}>{t("account.backupHint")}</Text>
      <EmailCode start={startBackup} submitLabel={t("account.confirm")}
        confirm={async (e, c) => {
          const r = await confirmBackup(e, c);
          if (r.ok) setEmail((await backedUpEmail()) ?? e.trim());
          return r;
        }} />
    </>
  );
}

/** Full screen, from the first screen: sign in with the backup email and bring the character to this phone. */
export function RestoreFlow({ onCancel, onRestored }: { onCancel(): void; onRestored(save: SavedGame, cells: string[]): void }) {
  const t = useT();
  const keyboard = useKeyboardInset();
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={onCancel} hitSlop={12}><Text style={styles.topLink}>{t("common.back")}</Text></Pressable>
      </View>
      <View style={[styles.body, { paddingBottom: keyboard }]}>
        <Text style={styles.title}>{t("account.restoreTitle")}</Text>
        <Text style={styles.hint}>{t("account.restoreHint")}</Text>
        <EmailCode start={startRestore} submitLabel={t("account.restore")}
          confirm={async (e, c) => {
            const r = await confirmRestore(e, c);
            if (!r.ok) return r;
            onRestored(r.save, r.cells);
            return { ok: true };
          }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  topBar: { height: 44, paddingHorizontal: 20, justifyContent: "center" },
  topLink: { color: color.textDim, fontSize: 15 },
  body: { flex: 1, paddingHorizontal: 20, gap: 10 },
  title: { color: color.text, fontSize: 26, fontWeight: "800", marginTop: 8 },
  form: { gap: 10, marginTop: 6 },
  input: {
    color: color.text, fontSize: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: StyleSheet.hairlineWidth, borderColor: color.panelBorder,
  },
  code: { fontSize: 24, letterSpacing: 8, textAlign: "center", fontVariant: ["tabular-nums"] },
  hint: { color: color.textDim, fontSize: 14, lineHeight: 19 },
  link: { color: color.xp, fontSize: 14, fontWeight: "700", textAlign: "center", paddingVertical: 4 },
  error: { color: "#F2555A", fontSize: 14 },
  done: { color: color.good, fontSize: 14, fontWeight: "600" },
});
