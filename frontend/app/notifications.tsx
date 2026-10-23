import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { api, AppNotification } from "@/src/api/client";
import { NOTIFICATION_ICON, notificationText, timeAgo } from "@/src/utils/notifications";

// Notification center: newest first. Opening it marks everything as read (the dots stay for this visit).
export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.notifications();
      setItems(res.items);
      if (res.unread > 0) api.markNotificationsRead().catch(() => {});
    } catch {
      setItems((cur) => cur ?? []);
    } finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    api.notifications().then((res) => {
      if (!alive) return;
      setItems(res.items);
      if (res.unread > 0) api.markNotificationsRead().catch(() => {});
    }).catch(() => { if (alive) setItems((cur) => cur ?? []); });
    return () => { alive = false; };
  }, []));

  const tone = (k: string) => ({ brand: colors.brand, accent: colors.accent, error: colors.error, warning: colors.warning }[k] || colors.brand);

  const renderItem = ({ item }: { item: AppNotification }) => {
    const meta = NOTIFICATION_ICON[item.type] || NOTIFICATION_ICON.chat;
    const { title, body } = notificationText(item, t, lang);
    const unread = !item.read_at;
    return (
      <Pressable testID={`notification-${item.id}`} onPress={() => router.push(item.action_url as any)}
        style={[styles.row, { backgroundColor: unread ? colors.surfaceSecondary : "transparent", borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: tone(meta.tone) + "22" }]}>
          <Ionicons name={meta.icon as any} size={20} color={tone(meta.tone)} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.title, { color: colors.onSurface, fontWeight: unread ? "800" : "600" }]} numberOfLines={3}>{title}</Text>
          {!!body && <Text style={[styles.body, { color: colors.onSurfaceSecondary }]} numberOfLines={2}>{body}</Text>}
          <Text style={[styles.time, { color: colors.onSurfaceTertiary }]}>{timeAgo(item.created_at, t, lang)}</Text>
        </View>
        {unread && <View style={[styles.dot, { backgroundColor: colors.error }]} />}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="notifications-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="notifications-back" onPress={() => router.back()} hitSlop={8} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t("notifications_title")}</Text>
        <View style={{ width: 26 }} />
      </View>
      {items === null ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 30 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="notifications-empty">
              <View style={[styles.emptyIcon, { backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="notifications-outline" size={30} color={colors.brand} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>{t("notifications_empty")}</Text>
              <Text style={[styles.emptyBody, { color: colors.onSurfaceTertiary }]}>{t("notifications_empty_body")}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  list: { padding: 12, gap: 8, flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, lineHeight: 19 },
  body: { fontSize: 13, lineHeight: 18 },
  time: { fontSize: 12 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  empty: { alignItems: "center", gap: 10, padding: 32, marginTop: 40 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
