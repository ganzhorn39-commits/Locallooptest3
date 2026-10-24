import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ImageBackground, Platform, Modal, TextInput, KeyboardAvoidingView } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";
import { storage } from "@/src/utils/storage";
import { LEGAL_DOCS, legalText } from "@/src/legal/content";
import { api, errorCode } from "@/src/api/client";
import AccountTypeCards, { AccountRole } from "@/src/components/AccountTypeCards";

export const PENDING_ROLE_KEY = "pending_account_role";

// BRANDING EXCEPTION: name + slogan are never translated.
const BRAND = "LocalLoop";
const SLOGAN = "Dein Stadtpuls. Live auf der Karte.";
const BG_URI =
  "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1000&q=80";

type Method = "email" | "apple" | "google";
const ERR_KEYS = ["invalid_email", "email_unavailable", "too_many_codes", "wrong_code", "code_expired", "too_many_tries", "email_failed", "banned"];

export default function Login() {
  const { user, login, signInWith, devLogin, loggingIn, enterGuest } = useAuth();
  const { lang, setLang, t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState<Method | null>(null); // method waiting for the account type
  const [methods, setMethods] = React.useState({ email: false, apple: false });
  const [emailOpen, setEmailOpen] = React.useState(false);
  const allowDev = process.env.EXPO_PUBLIC_ALLOW_DEV_LOGIN === "1";

  useEffect(() => { if (user) router.replace("/(tabs)"); }, [user]);

  // E-mail only when the server can deliver codes; Apple only on iPhones that support it.
  useEffect(() => {
    let alive = true;
    api.authMethods().then((m) => { if (alive) setMethods((x) => ({ ...x, email: m.email })); }).catch(() => {});
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then((ok) => { if (alive) setMethods((x) => ({ ...x, apple: ok })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, []);

  const continueAsGuest = async () => {
    await enterGuest();
    router.replace("/(tabs)");
  };

  const appleLogin = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!cred.identityToken) throw new Error("no token");
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(" ");
      await signInWith(await api.appleSignIn(cred.identityToken, name));
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") setNote(t("err_apple"));
    }
  };

  const proceed = async (method: Method, role: AccountRole | null) => {
    setPending(null);
    setNote("");
    if (role) await storage.setItem(PENDING_ROLE_KEY, role); // used by onboarding for new accounts
    if (method === "google") login();
    else if (method === "apple") setTimeout(appleLogin, Platform.OS === "ios" ? 350 : 0);
    else setTimeout(() => setEmailOpen(true), Platform.OS === "ios" ? 350 : 0);
  };

  return (
    <View style={styles.container} testID="login-screen">
      <ImageBackground source={{ uri: BG_URI }} style={StyleSheet.absoluteFill} resizeMode="cover">
        <LinearGradient
          colors={["rgba(4,6,20,0.30)", "rgba(4,6,20,0.55)", "rgba(4,6,20,0.92)"]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.brandHead}>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="location" size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.wordmark}>{BRAND}</Text>
          </View>
        </View>

        {/* Floating glassmorphic card */}
        <BlurView intensity={Platform.OS === "android" ? 90 : 55} tint="dark" style={styles.glass}>
          <View style={styles.glassInner}>
            <Text style={styles.slogan}>{SLOGAN}</Text>

            {!!note && <Text style={styles.note} testID="login-note">{note}</Text>}

            {methods.apple && (
              <AppleAuthentication.AppleAuthenticationButton
                testID="apple-login-button"
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={16}
                style={styles.appleBtn}
                onPress={() => setPending("apple")}
              />
            )}

            {methods.email && (
              <Pressable testID="email-login-button" onPress={() => setPending("email")} style={[styles.btn, styles.emailBtn]}>
                <Ionicons name="mail" size={20} color="#111111" />
                <Text style={styles.emailText}>{t("login_email")}</Text>
              </Pressable>
            )}

            <Pressable testID="google-login-button" onPress={() => setPending("google")} disabled={loggingIn}
              style={[styles.btn, methods.email || methods.apple ? styles.googleSecondary : styles.googleBtn, { opacity: loggingIn ? 0.7 : 1 }]}>
              {loggingIn ? <ActivityIndicator color="#FFFFFF" /> : (<>
                <View style={styles.gIcon}><Text style={styles.gIconText}>G</Text></View>
                <Text style={methods.email || methods.apple ? styles.googleSecondaryText : styles.googleText}>{t("google")}</Text>
              </>)}
            </Pressable>

            <View style={styles.orRow}>
              <View style={styles.orLine} /><Text style={styles.orText}>{lang === "de" ? "oder" : "or"}</Text><View style={styles.orLine} />
            </View>

            <Pressable testID="guest-continue-button" onPress={continueAsGuest} style={[styles.btn, styles.guestBtn]}>
              <Ionicons name="compass" size={21} color="#FFFFFF" />
              <Text style={styles.guestText}>{t("guest_prominent")}</Text>
            </Pressable>

            {allowDev && (
              <Pressable testID="demo-login-button" onPress={devLogin} disabled={loggingIn} style={styles.demoBtn}>
                <Text style={styles.demoText}>{t("demo")}</Text>
              </Pressable>
            )}

            <View style={styles.bottomBar}>
              <Pressable testID="language-toggle" onPress={() => setLang(lang === "en" ? "de" : "en")} hitSlop={10}>
                <Text style={styles.barLink}>{lang === "en" ? "DE / EN" : "EN / DE"}</Text>
              </Pressable>
            </View>
            <View style={styles.legalRow}>
              {LEGAL_DOCS.map((doc, i) => (
                <React.Fragment key={doc}>
                  {i > 0 && <Text style={styles.legalDot}>·</Text>}
                  <Text testID={`login-legal-${doc}`} onPress={() => router.push(`/legal/${doc}`)} style={styles.legalLink}>
                    {legalText(doc, lang).title}
                  </Text>
                </React.Fragment>
              ))}
            </View>
          </View>
        </BlurView>
      </View>

      {/* Account type chooser (new accounts start as personal or business) */}
      <Modal visible={!!pending} transparent animationType="slide" onRequestClose={() => setPending(null)}>
        <View style={styles.atBg}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPending(null)} testID="account-type-backdrop" />
          <View style={[styles.atCard, { paddingBottom: insets.bottom + 24 }]} testID="account-type-sheet">
            <View style={styles.handle} />
            <Text style={styles.atTitle}>{t("choose_account")}</Text>
            <AccountTypeCards glass onChoose={(role) => pending && proceed(pending, role)} />
            <Pressable testID="account-existing" onPress={() => pending && proceed(pending, null)} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 6 }}>
              <Text style={styles.existing}>{t("acct_existing")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <EmailLogin visible={emailOpen} onClose={() => setEmailOpen(false)} onSignedIn={async (res) => { setEmailOpen(false); await signInWith(res); }} />
    </View>
  );
}

// E-mail code sign-in (also sign-up): address -> 6-digit code.
function EmailLogin({ visible, onClose, onSignedIn }: {
  visible: boolean; onClose: () => void; onSignedIn: (res: { user: any; session_token: string }) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [devCode, setDevCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const message = (e: unknown) => {
    const c = errorCode(e);
    return c && ERR_KEYS.includes(c) ? t(`err_${c}`) : t("err_generic");
  };

  const send = async () => {
    setError(""); setBusy(true);
    try {
      const r = await api.emailStart(email.trim(), lang);
      setDevCode(r.dev_code || "");
      setCode("");
      setStep("code");
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };

  const verify = async () => {
    setError(""); setBusy(true);
    try {
      await onSignedIn(await api.emailVerify(email.trim(), code));
      setStep("email"); setCode(""); setDevCode("");
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.atBg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.atCard, { paddingBottom: insets.bottom + 24, gap: 12 }]} testID="email-sheet">
          <View style={styles.handle} />
          <Text style={styles.atTitle}>{step === "email" ? t("email_title") : t("code_title")}</Text>
          <Text style={styles.sheetBody}>{step === "email" ? t("email_intro") : t("code_sent").replace("{email}", email.trim())}</Text>
          {step === "email" ? (
            <TextInput testID="email-input" value={email} onChangeText={setEmail} placeholder={t("email_ph")} placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress"
              onSubmitEditing={send} returnKeyType="send" style={styles.sheetInput} />
          ) : (
            <TextInput testID="email-code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder={t("code_ph")}
              placeholderTextColor="rgba(255,255,255,0.4)" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
              onSubmitEditing={verify} maxLength={6} style={[styles.sheetInput, styles.codeInput]} />
          )}
          {!!devCode && step === "code" && <Text testID="email-dev-code" style={styles.devCode}>{t("code_dev").replace("{code}", devCode)}</Text>}
          {!!error && <Text testID="email-error" style={styles.sheetError}>{error}</Text>}
          <Pressable testID={step === "email" ? "email-send" : "email-verify"} onPress={step === "email" ? send : verify}
            disabled={busy || (step === "email" ? !email.trim() : code.length !== 6)}
            style={[styles.btn, styles.emailBtn, { opacity: busy || (step === "email" ? !email.trim() : code.length !== 6) ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#111111" /> : <Text style={styles.emailText}>{step === "email" ? t("email_send") : t("code_verify")}</Text>}
          </Pressable>
          {step === "code" && (
            <View style={styles.codeLinks}>
              <Text testID="email-resend" onPress={busy ? undefined : send} style={styles.barLink}>{t("code_resend")}</Text>
              <Text testID="email-change" onPress={() => { setStep("email"); setError(""); }} style={styles.barLink}>{t("code_change")}</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#02040e" },
  content: { flex: 1, paddingHorizontal: 20, justifyContent: "space-between" },
  brandHead: { alignItems: "center", marginTop: 24 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(31,176,208,0.92)", alignItems: "center", justifyContent: "center" },
  wordmark: { color: "#FFFFFF", fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  glass: {
    borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  glassInner: { padding: 22, gap: 12, backgroundColor: "rgba(12,14,30,0.35)" },
  slogan: { color: "#FFFFFF", fontSize: 20, textAlign: "center", fontWeight: "700", marginBottom: 6 },
  note: { color: "#0BD9D9", fontSize: 13, textAlign: "center", fontWeight: "600" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, height: 54, borderRadius: 16 },
  googleBtn: { backgroundColor: "#FFFFFF" },
  googleSecondary: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  gIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#EA4335", alignItems: "center", justifyContent: "center" },
  gIconText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  googleText: { color: "#111111", fontSize: 16, fontWeight: "700" },
  googleSecondaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  appleBtn: { height: 54, width: "100%" },
  emailBtn: { backgroundColor: "#FFFFFF" },
  emailText: { color: "#111111", fontSize: 16, fontWeight: "800" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  orText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  guestBtn: { backgroundColor: "#159AB8" },
  guestText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  demoBtn: { alignItems: "center", paddingVertical: 4 },
  demoText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
  bottomBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  barLink: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700" },
  legalRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, flexWrap: "wrap" },
  legalLink: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600" },
  legalDot: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
  atBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  atCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 16, backgroundColor: "#0D1018", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  atTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  existing: { color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: "700", textDecorationLine: "underline" },
  sheetBody: { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 20 },
  sheetInput: { height: 54, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.06)", color: "#FFFFFF", paddingHorizontal: 16, fontSize: 16 },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: "center", fontWeight: "800" },
  devCode: { color: "#7FE0F2", fontSize: 13, fontWeight: "700" },
  sheetError: { color: "#FF6369", fontSize: 14, fontWeight: "700" },
  codeLinks: { flexDirection: "row", justifyContent: "space-between" },
});
