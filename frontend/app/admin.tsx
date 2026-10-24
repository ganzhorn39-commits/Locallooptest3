import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, ModerationItem } from "@/src/api/client";
import { timeAgo } from "@/src/utils/notifications";
import ActionSheet from "@/src/components/ActionSheet";

const ICON: Record<string, string> = { message: "chatbubble-ellipses-outline", event: "calendar-outline", user: "person-outline" };

// Moderation queue (only for e-mails in ADMIN_EMAILS): every reported item once, most reported first.
export default function Admin() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<ModerationItem | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.adminReports()); } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (item: ModerationItem, action: "dismiss" | "remove" | "ban") => {
    setBusy(item.id);
    try {
      await api.moderate(item.id, action);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {} finally { setBusy(null); }
  };

  if (!user?.is_admin) return <View style={[styles.container, { backgroundColor: colors.surface }]} />;

  const render = ({ item }: { item: ModerationItem }) => (
    <View testID={`mod-item-${item.target_id}`} style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <View style={styles.headRow}>
        <View style={[styles.typeIcon, { backgroundColor: colors.surfaceTertiary }]}>
          <Ionicons name={ICON[item.target_type] as any} size={18} color={colors.onSurface} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.type, { color: colors.onSurface }]}>
            {t(`mod_type_${item.target_type}`)}{item.owner_name ? ` · ${t("mod_by").replace("{name}", item.owner_name)}` : ""}
            {item.owner_banned ? ` (${t("mod_banned")})` : ""}
          </Text>
          <Text style={[styles.meta, { color: colors.onSurfaceTertiary }]}>{timeAgo(item.created_at, t, lang)}</Text>
        </View>
        <View style={[styles.count, { backgroundColor: item.count > 1 ? colors.error : colors.surfaceTertiary }]}>
          <Text style={[styles.countText, { color: item.count > 1 ? "#FFFFFF" : colors.onSurface }]}>{t("mod_reports").replace("{n}", String(item.count))}</Text>
        </View>
      </View>
      {!!item.snapshot && <Text style={[styles.snapshot, { color: colors.onSurface, borderColor: colors.border }]} numberOfLines={4}>„{item.snapshot}“</Text>}
      <View style={styles.reasons}>
        {item.reasons.map((r) => (
          <View key={r} style={[styles.reason, { borderColor: colors.error }]}><Text style={[styles.reasonText, { color: colors.error }]}>{t(`reason_${r}`)}</Text></View>
        ))}
      </View>
      {item.notes.map((n, i) => <Text key={i} style={[styles.note, { color: colors.onSurfaceSecondary }]}>– {n}</Text>)}
      {busy === item.id ? <ActivityIndicator color={colors.brand} /> : (
        <View style={styles.actions}>
          <Btn testID={`mod-dismiss-${item.target_id}`} label={t("mod_dismiss")} icon="checkmark" color={colors.onSurfaceSecondary} border={colors.border} onPress={() => act(item, "dismiss")} />
          {item.target_type !== "user" && (
            <Btn testID={`mod-remove-${item.target_id}`} label={item.target_type === "message" ? t("mod_remove_message") : t("mod_remove_event")}
              icon="trash-outline" color={colors.error} border={colors.error} onPress={() => act(item, "remove")} />
          )}
          {!!item.target_owner_id && !item.owner_banned && (
            <Btn testID={`mod-ban-${item.target_id}`} label={t("mod_ban")} icon="ban" color="#FFFFFF" bg={colors.error} border={colors.error} onPress={() => setConfirmBan(item)} />
          )}
          {!!item.event_id && (
            <Btn label={t("mod_open_event")} icon="open-outline" color={colors.brand} border={colors.brand}
              onPress={() => router.push(item.target_type === "message" ? `/chat/${item.event_id}` : `/event/${item.event_id}`)} />
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="admin-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="admin-back" onPress={() => router.back()} hitSlop={10} style={{ width: 28 }}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.title, { color: colors.onSurface }]}>{t("moderation_queue")}</Text>
        <View style={{ width: 28 }} />
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={render}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="admin-empty">
              <Ionicons name="shield-checkmark-outline" size={40} color={colors.success} />
              <Text style={[styles.emptyText, { color: colors.onSurfaceSecondary }]}>{t("mod_empty")}</Text>
            </View>
          }
        />
      )}
      <ActionSheet
        testID="mod-ban-confirm"
        visible={!!confirmBan}
        title={confirmBan ? t("mod_ban_title").replace("{name}", confirmBan.owner_name || "?") : undefined}
        message={t("mod_ban_body")}
        onClose={() => setConfirmBan(null)}
        actions={confirmBan ? [{ key: "ban-confirm", label: t("mod_ban"), icon: "ban", danger: true, onPress: () => act(confirmBan, "ban") }] : []}
      />
    </View>
  );
}

function Btn({ label, icon, color, border, bg, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.btn, { borderColor: border, backgroundColor: bg || "transparent" }]}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.btnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: "800" },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  typeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  type: { fontSize: 14, fontWeight: "800" },
  meta: { fontSize: 12, marginTop: 1 },
  count: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  countText: { fontSize: 11, fontWeight: "900" },
  snapshot: { fontSize: 14, lineHeight: 20, borderLeftWidth: 3, paddingLeft: 10 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reason: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  reasonText: { fontSize: 11, fontWeight: "800" },
  note: { fontSize: 13, fontStyle: "italic" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: { flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5 },
  btnText: { fontSize: 13, fontWeight: "800" },
  empty: { alignItems: "center", gap: 10, marginTop: 60 },
  emptyText: { fontSize: 15, fontWeight: "600" },
});
