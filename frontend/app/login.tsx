import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ImageBackground, Platform, Modal } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";
import { storage } from "@/src/utils/storage";
import { LEGAL_DOCS, legalText } from "@/src/legal/content";

export const PENDING_ROLE_KEY = "pending_account_role";

// BRANDING EXCEPTION: name + slogan are never translated.
const BRAND = "LocalLoop";
const SLOGAN = "Dein Stadtpuls. Live auf der Karte.";
const BG_URI =
  "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1000&q=80";

export default function Login() {
  const { user, login, devLogin, loggingIn, enterGuest } = useAuth();
  const { lang, setLang, t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [showAccountType, setShowAccountType] = React.useState(false);
  const allowDev = process.env.EXPO_PUBLIC_ALLOW_DEV_LOGIN === "1";

  useEffect(() => { if (user) router.replace("/(tabs)"); }, [user]);

  const continueAsGuest = async () => {
    await enterGuest();
    router.replace("/(tabs)");
  };

  const chooseRole = async (role: "user" | "business") => {
    await storage.setItem(PENDING_ROLE_KEY, role);
    setShowAccountType(false);
    login();
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

            <Pressable testID="google-login-button" onPress={() => setShowAccountType(true)} disabled={loggingIn} style={[styles.btn, styles.googleBtn, { opacity: loggingIn ? 0.7 : 1 }]}>
              {loggingIn ? <ActivityIndicator color="#111" /> : (<>
                <View style={styles.gIcon}><Text style={styles.gIconText}>G</Text></View>
                <Text style={styles.googleText}>{t("google")}</Text>
              </>)}
            </Pressable>

            <Pressable testID="facebook-login-button" onPress={() => setNote(t("soon"))} style={[styles.btn, styles.fbBtn]}>
              <Ionicons name="logo-facebook" size={22} color="#FFFFFF" />
              <Text style={styles.fbText}>{t("facebook")}</Text>
            </Pressable>

            <Pressable testID="email-login-button" onPress={() => setNote(t("soon"))} style={[styles.btn, styles.emailBtn]}>
              <Ionicons name="mail-outline" size={20} color="#FFFFFF" />
              <Text style={styles.emailText}>Email OTP</Text>
            </Pressable>

            <Pressable testID="guest-continue-button" onPress={continueAsGuest} style={[styles.btn, styles.guestBtn]}>
              <Ionicons name="compass-outline" size={20} color="#FFFFFF" />
              <Text style={styles.guestText}>{t("guest_continue")}</Text>
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
              <Pressable testID="business-login" onPress={() => chooseRole("business")} hitSlop={10}>
                <Text style={styles.barLink}>{t("business")}</Text>
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

      {/* Account type chooser */}
      <Modal visible={showAccountType} transparent animationType="fade" onRequestClose={() => setShowAccountType(false)}>
        <Pressable style={styles.atBg} onPress={() => setShowAccountType(false)} testID="account-type-backdrop">
          <BlurView intensity={Platform.OS === "android" ? 100 : 60} tint="dark" style={styles.atCard}>
            <Pressable>
              <Text style={styles.atTitle}>{t("choose_account")}</Text>
              <Pressable testID="account-personal" onPress={() => chooseRole("user")} style={styles.atOption}>
                <View style={[styles.atIcon, { backgroundColor: "#159AB8" }]}><Ionicons name="person" size={22} color="#FFFFFF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.atLabel}>{t("acct_personal")}</Text>
                  <Text style={styles.atDesc}>{t("acct_personal_desc")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              </Pressable>
              <Pressable testID="account-business" onPress={() => chooseRole("business")} style={styles.atOption}>
                <View style={[styles.atIcon, { backgroundColor: "#2EE6A6" }]}><Ionicons name="briefcase" size={22} color="#04160F" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.atLabel}>{t("acct_business")}</Text>
                  <Text style={styles.atDesc}>{t("acct_business_desc")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </Pressable>
          </BlurView>
        </Pressable>
      </Modal>
    </View>
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
  gIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#EA4335", alignItems: "center", justifyContent: "center" },
  gIconText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  googleText: { color: "#111111", fontSize: 16, fontWeight: "700" },
  fbBtn: { backgroundColor: "#1877F2" },
  fbText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  emailBtn: { backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  emailText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  guestBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  guestText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  demoBtn: { alignItems: "center", paddingVertical: 4 },
  demoText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
  bottomBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  barLink: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700" },
  legalRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, flexWrap: "wrap" },
  legalLink: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600" },
  legalDot: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
  atBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  atCard: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 40, gap: 14, overflow: "hidden", backgroundColor: "rgba(12,14,20,0.6)", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  atTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginBottom: 6 },
  atOption: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 10 },
  atIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  atLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  atDesc: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 },
});
