import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, EventItem } from "@/src/api/client";
import { categoryMeta } from "@/src/constants/categories";
import { countdown } from "@/src/utils/filters";
import DealCard from "@/src/components/DealCard";

export default function EventDetail() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [e, setE] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Reload on focus so edits made by the host show up when coming back from the edit form.
  useFocusEffect(useCallback(() => {
    (async () => { try { setE(await api.getEvent(id)); } catch {} finally { setLoading(false); } })();
  }, [id]));

  if (loading || !e) return <View style={[styles.container, { backgroundColor: colors.surface }]}><ActivityIndicator style={{ marginTop: 80 }} color={colors.brand} /></View>;
  const meta = categoryMeta(e.category);
  const canEdit = !!user && e.created_by === user.user_id && e.status !== "cancelled";

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="event-detail-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={styles.hero}>
          {e.image_url ? <Image source={{ uri: e.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: meta.color }]} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
          <Pressable testID="event-detail-back" onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
          {canEdit && (
            <Pressable testID="event-detail-edit" accessibilityLabel={t("edit_event")} onPress={() => router.push(`/edit-event/${id}`)}
              style={[styles.edit, { top: insets.top + 8 }]}>
              <Ionicons name="create-outline" size={22} color="#FFFFFF" />
            </Pressable>
          )}
          <View style={styles.heroText}>
            <View style={[styles.catPill, { backgroundColor: meta.color }]}><Text style={styles.catPillText}>{meta.emoji} {t(`cat_${e.category}`)}</Text></View>
            <Text style={styles.title}>{e.title}</Text>
            {!!e.venue_name && <Text style={styles.venue}>{e.venue_name}</Text>}
          </View>
        </View>
        <View style={{ padding: 16, gap: 14 }}>
          <Row icon="time-outline" color={colors.brand} text={e.is_recurring && e.recurrence_label ? e.recurrence_label : countdown(e.next_occurrence || e.start_time)} colors={colors} />
          {!!e.address && <Row icon="location-outline" color={colors.brand} text={e.address} colors={colors} />}
          {!!e.capacity && e.capacity > 0 && <Row icon="people-outline" color={colors.brand} text={`${e.spots_taken || 0}/${e.capacity}`} colors={colors} />}
          {!!e.rating && e.rating > 0 && <Row icon="star" color="#FFD60A" text={`${e.rating.toFixed(1)} (${e.rating_count})`} colors={colors} />}
          {!!e.description && <Text style={[styles.desc, { color: colors.onSurfaceSecondary }]}>{e.description}</Text>}
          <DealCard key={e.id} event={e} />
          <Pressable testID="event-detail-participants" onPress={() => router.push(`/participants/${id}`)} style={[styles.linkBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            <Ionicons name="people" size={18} color={colors.brand} />
            <Text style={[styles.linkText, { color: colors.onSurface }]}>{e.live_count} {t("attending")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} style={{ marginLeft: "auto" }} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ icon, text, color, colors }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.rowText, { color: colors.onSurfaceSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { height: 260, justifyContent: "flex-end" },
  back: { position: "absolute", left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  edit: { position: "absolute", right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroText: { padding: 16, gap: 6 },
  catPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  catPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  venue: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { fontSize: 15, fontWeight: "600", flex: 1 },
  desc: { fontSize: 15, lineHeight: 22 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  linkText: { fontSize: 15, fontWeight: "700" },
});
