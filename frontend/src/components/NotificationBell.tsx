import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/api/client";

const POLL_MS = 60_000;

// Bell with a red badge for unread notifications. `boxed` matches the 48px search field on the map.
export default function NotificationBell({ boxed }: { boxed?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, promptLogin } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    let alive = true;
    const check = () => api.unreadNotifications().then((r) => { if (alive) setUnread(r.unread); }).catch(() => {});
    check();
    const timer = setInterval(check, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [user]));

  const open = () => {
    if (!user) { promptLogin(); return; }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setUnread(0);
    router.push("/notifications");
  };

  const shown = user ? unread : 0;
  return (
    <Pressable testID="notification-bell" onPress={open} hitSlop={8} accessibilityLabel={t("notifications_title")}
      style={[boxed ? styles.boxed : styles.plain, boxed && { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Ionicons name={shown > 0 ? "notifications" : "notifications-outline"} size={boxed ? 22 : 25} color={colors.onSurface} />
      {shown > 0 && (
        <View testID="notification-badge" style={[styles.badge, { backgroundColor: colors.error, borderColor: boxed ? colors.surfaceSecondary : colors.surface }]}>
          <Text style={styles.badgeText}>{shown > 9 ? "9+" : shown}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boxed: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  plain: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
});
