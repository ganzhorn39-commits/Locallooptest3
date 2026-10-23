import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ThemeProvider, useTheme } from "@/src/theme/theme";
import { AuthProvider, useAuth } from "@/src/auth/AuthContext";
import { I18nProvider } from "@/src/i18n";
import { registerForPush } from "@/src/push";
import SplashIntro from "@/src/components/SplashIntro";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Push: foreground handler + Android channel at module scope (before any component)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

function AuthGate() {
  const { user, loading, guest } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showIntro, setShowIntro] = useState(true);

  // Push tap handlers (native only)
  useEffect(() => {
    if (Platform.OS === "web") return;
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (!url) return;
      url.startsWith("http") ? Linking.openURL(url) : router.push(url);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (url) (url.startsWith("http") ? Linking.openURL(url) : router.push(url));
    });
    return () => tapSub.remove();
  }, []);

  // Register for push on login
  useEffect(() => {
    if (user) registerForPush(user.user_id);
  }, [user]);

  // Auth routing
  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "login";
    const inOnboarding = segments[0] === "onboarding";
    if (!user && !guest && !inAuth) router.replace("/login");
    else if (user && !user.onboarded && !inOnboarding) router.replace("/onboarding");
    else if (user && user.onboarded && (inAuth || inOnboarding)) router.replace("/(tabs)");
  }, [user, loading, guest, segments]);

  return (
    <>
      <ThemedStatusBar />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="login" options={{ animation: "fade" }} />
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="verify" options={{ presentation: "modal" }} />
        <Stack.Screen name="participants/[eventId]" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="chat/[eventId]" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="crew/[id]" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="edit-event/[id]" options={{ animation: "slide_from_bottom" }} />
      </Stack>
      {showIntro && <SplashIntro onDone={() => setShowIntro(false)} />}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <I18nProvider>
              <AuthProvider>
                <AuthGate />
              </AuthProvider>
            </I18nProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
