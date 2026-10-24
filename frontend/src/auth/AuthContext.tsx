import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform, Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY } from "@/src/api/client";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";

type User = {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  bio?: string;
  instagram?: string;
  birthdate?: string;
  account_type?: "user" | "business";
  onboarded?: boolean;
  verified?: boolean;
  business_name?: string;
  business_category?: string;
  business_address?: string;
  business_website?: string;
  business_instagram?: string;
  identity_verified?: boolean;
  terms_accepted_at?: string; // Nutzungsbedingungen + Community-Richtlinien akzeptiert
  truth_confirmed_at?: string; // "Angaben entsprechen der Wahrheit" bestätigt
  lang?: "de" | "en"; // language of push texts (synced from the app language)
  push_events?: boolean;
  push_messages?: boolean;
};
type AuthState = { user: User | null; loading: boolean; loggingIn: boolean; guest: boolean };

type Ctx = AuthState & {
  login: () => Promise<void>; // Google (Emergent auth)
  signInWith: (res: { user: User; session_token: string }) => Promise<void>; // e-mail code / Apple
  devLogin: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  enterGuest: () => Promise<void>;
  promptLogin: () => void;
};

const AuthCtx = createContext<Ctx>({} as Ctx);
const AUTH_BASE = "https://auth.emergentagent.com";
const GUEST_KEY = "localloop_guest";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [guest, setGuest] = useState(false);
  const [wallVisible, setWallVisible] = useState(false);

  const processSessionId = useCallback(async (sessionId: string) => {
    const res = await api.createAuthSession(sessionId);
    await storage.secureSet(TOKEN_KEY, res.session_token);
    await storage.removeItem(GUEST_KEY);
    setGuest(false);
    setUser(res.user);
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      // Web: session_id may be present in hash / query on return
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const hash = window.location.hash || "";
        const search = window.location.search || "";
        const m = hash.match(/session_id=([^&]+)/) || search.match(/session_id=([^&]+)/);
        if (m) {
          await processSessionId(decodeURIComponent(m[1]));
          window.history.replaceState(null, "", window.location.pathname);
          setLoading(false);
          return;
        }
      }
      // Existing token
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (token) {
        try {
          const me = await api.me();
          setUser(me);
        } catch {
          await storage.secureRemove(TOKEN_KEY);
        }
      } else {
        const g = await storage.getItem<boolean>(GUEST_KEY, false);
        if (g) setGuest(true);
      }
    } finally {
      setLoading(false);
    }
  }, [processSessionId]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async () => {
    setLoggingIn(true);
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const redirectUrl = window.location.origin + "/";
        window.location.href = `${AUTH_BASE}/?redirect=${encodeURIComponent(redirectUrl)}`;
        return;
      }
      const redirectUrl = Linking.createURL("");
      const authUrl = `${AUTH_BASE}/?redirect=${encodeURIComponent(redirectUrl)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === "success" && result.url) {
        const m =
          result.url.match(/session_id=([^&]+)/) ||
          result.url.match(/#session_id=([^&]+)/);
        if (m) {
          await processSessionId(decodeURIComponent(m[1]));
        }
      }
    } finally {
      setLoggingIn(false);
    }
  }, [processSessionId]);

  const signInWith = useCallback(async (res: { user: User; session_token: string }) => {
    await storage.secureSet(TOKEN_KEY, res.session_token);
    await storage.removeItem(GUEST_KEY);
    setGuest(false);
    setUser(res.user);
  }, []);

  const devLogin = useCallback(async () => {
    setLoggingIn(true);
    try {
      const res = await api.devSession();
      await storage.secureSet(TOKEN_KEY, res.session_token);
      await storage.removeItem(GUEST_KEY);
      setGuest(false);
      setUser(res.user);
    } finally {
      setLoggingIn(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(GUEST_KEY);
    setGuest(false);
    setUser(null);
  }, []);

  const enterGuest = useCallback(async () => {
    await storage.setItem(GUEST_KEY, true);
    setGuest(true);
  }, []);

  const promptLogin = useCallback(() => setWallVisible(true), []);

  return (
    <AuthCtx.Provider value={{ user, loading, loggingIn, guest, login, signInWith, devLogin, logout, refresh, enterGuest, promptLogin }}>
      {children}
      <LoginWall
        visible={wallVisible}
        onClose={() => setWallVisible(false)}
        onLogin={() => { setWallVisible(false); router.push("/login"); }} // choose e-mail / Apple / Google there
      />
    </AuthCtx.Provider>
  );
}

function LoginWall({ visible, onClose, onLogin }: { visible: boolean; onClose: () => void; onLogin: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={wallStyles.bg} onPress={onClose} testID="login-wall-backdrop">
        <BlurView intensity={Platform.OS === "android" ? 100 : 60} tint="dark" style={wallStyles.card}>
          <Pressable style={{ gap: 14, alignItems: "center" }}>
            <View style={[wallStyles.iconWrap, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="lock-closed" size={28} color={colors.brand} />
            </View>
            <Text style={wallStyles.title}>{t("wall_title")}</Text>
            <Text style={wallStyles.body}>{t("wall_body")}</Text>
            <Pressable testID="login-wall-login" onPress={onLogin} style={[wallStyles.loginBtn, { backgroundColor: colors.brand }]}>
              <Ionicons name="log-in-outline" size={20} color={colors.onBrand} />
              <Text style={[wallStyles.loginText, { color: colors.onBrand }]}>{t("wall_login")}</Text>
            </Pressable>
            <Pressable testID="login-wall-later" onPress={onClose} hitSlop={8} style={{ paddingVertical: 4 }}>
              <Text style={wallStyles.later}>{t("wall_later")}</Text>
            </Pressable>
          </Pressable>
        </BlurView>
      </Pressable>
    </Modal>
  );
}

const wallStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  card: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 40, overflow: "hidden", backgroundColor: "rgba(12,14,20,0.7)", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  iconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", textAlign: "center" },
  body: { color: "rgba(255,255,255,0.7)", fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },
  loginBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 16, alignSelf: "stretch", marginTop: 6 },
  loginText: { fontSize: 16, fontWeight: "800" },
  later: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "600" },
});

export const useAuth = () => useContext(AuthCtx);
