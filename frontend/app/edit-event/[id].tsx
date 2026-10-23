import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, EventItem } from "@/src/api/client";
import CreateEventScreen from "@/src/screens/CreateEventScreen";

// Edit an existing event: the create form, pre-filled. Only the host gets the form.
export default function EditEvent() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.getEvent(id).then(setEvent).catch(() => setFailed(true));
  }, [id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/dashboard"));

  const blocked = failed
    ? t("event_load_failed")
    : event && event.created_by !== user?.user_id
      ? t("edit_not_host")
      : event?.status === "cancelled"
        ? t("edit_cancelled")
        : "";

  if (event && !blocked) return <CreateEventScreen initial={event} showClose onDone={close} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="edit-event-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="edit-event-close" onPress={close} hitSlop={8} style={{ width: 26 }}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t("edit_event")}</Text>
        <View style={{ width: 26 }} />
      </View>
      {blocked ? (
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={34} color={colors.onSurfaceTertiary} />
          <Text testID="edit-event-blocked" style={[styles.message, { color: colors.onSurfaceSecondary }]}>{blocked}</Text>
        </View>
      ) : (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  centered: { alignItems: "center", gap: 12, padding: 32, marginTop: 40 },
  message: { fontSize: 15, textAlign: "center", lineHeight: 21 },
});
