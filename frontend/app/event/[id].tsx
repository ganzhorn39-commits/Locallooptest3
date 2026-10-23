import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Share, Modal, Platform } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, EventItem } from "@/src/api/client";
import { categoryMeta } from "@/src/constants/categories";
import { countdown } from "@/src/utils/filters";
import DealCard from "@/src/components/DealCard";
import ActionSheet from "@/src/components/ActionSheet";
import ReportSheet from "@/src/components/ReportSheet";

export default function EventDetail() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, promptLogin } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [e, setE] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<{ count: number; participants: any[] } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  // Reload on focus so edits made by the host show up when coming back from the edit form.
  const load = useCallback(async () => {
    try { setE(await api.getEvent(id)); } catch {} finally { setLoading(false); }
    if (user) { try { setPeople(await api.participants(id)); } catch {} }
  }, [id, user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !e) return <View style={[styles.container, { backgroundColor: colors.surface }]}><ActivityIndicator style={{ marginTop: 80 }} color={colors.brand} /></View>;
  const meta = categoryMeta(e.category);
  const cancelled = e.status === "cancelled";
  const isHost = !!user && e.created_by === user.user_id;
  const canEdit = isHost && !cancelled;
  const shown = (people?.participants || []).slice(0, 6);

  const share = async () => {
    try {
      const url = e.website || e.tickets_url || "";
      await Share.share({ message: `${e.title} @ ${e.venue_name || e.host_name || e.address}\n${url}`.trim() });
    } catch {}
  };

  const blockHost = async () => {
    try {
      await api.toggleBlock(e.created_by);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.back();
    } catch {}
  };

  const cancelEvent = async () => {
    setCancelling(true);
    try {
      await api.cancelEvent(e.id);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await load();
    } catch {} finally { setCancelling(false); setConfirmCancel(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="event-detail-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={styles.hero}>
          {e.image_url ? <Image source={{ uri: e.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: meta.color }]} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
          <Pressable testID="event-detail-back" onPress={() => router.back()} style={[styles.roundBtn, { top: insets.top + 8, left: 16 }]}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={[styles.heroActions, { top: insets.top + 8 }]}>
            <Pressable testID="event-detail-share" accessibilityLabel={t("share")} onPress={share} style={styles.roundBtnStatic}>
              <Ionicons name="share-social-outline" size={21} color="#FFFFFF" />
            </Pressable>
            {canEdit && (
              <Pressable testID="event-detail-edit" accessibilityLabel={t("edit_event")} onPress={() => router.push(`/edit-event/${id}`)} style={styles.roundBtnStatic}>
                <Ionicons name="create-outline" size={22} color="#FFFFFF" />
              </Pressable>
            )}
            {!isHost && (
              <Pressable testID="event-detail-more" accessibilityLabel={t("more_options")} onPress={() => (user ? setShowMore(true) : promptLogin())} style={styles.roundBtnStatic}>
                <Ionicons name="ellipsis-horizontal" size={21} color="#FFFFFF" />
              </Pressable>
            )}
          </View>
          <View style={styles.heroText}>
            <View style={styles.pillRow}>
              <View style={[styles.catPill, { backgroundColor: meta.color }]}><Text style={styles.catPillText}>{meta.emoji} {t(`cat_${e.category}`)}</Text></View>
              {cancelled && <View style={[styles.catPill, { backgroundColor: colors.error }]}><Text style={styles.catPillText}>{t("cancelled_badge")}</Text></View>}
            </View>
            <Text style={styles.title}>{e.title}</Text>
            {!!e.venue_name && <Text style={styles.venue}>{e.venue_name}</Text>}
          </View>
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          {cancelled && (
            <View testID="event-cancelled-banner" style={[styles.banner, { borderColor: colors.error }]}>
              <Ionicons name="close-circle" size={18} color={colors.error} />
              <Text style={[styles.bannerText, { color: colors.error }]}>{t("event_cancelled_banner")}</Text>
            </View>
          )}
          {!!e.host_name && (
            <Pressable testID="event-detail-host" onPress={() => router.push(`/user/${e.created_by}`)} style={styles.row}>
              <Ionicons name={e.host_is_business ? "briefcase" : "person-circle-outline"} size={18} color={colors.brand} />
              <Text style={[styles.rowText, { color: colors.onSurfaceSecondary }]}>{t("hosted_by").replace("{name}", e.host_name)}</Text>
              {e.host_is_business && <Ionicons name="checkmark-circle" size={16} color={colors.brand} />}
            </Pressable>
          )}
          <Row icon="time-outline" color={colors.brand} text={e.is_recurring && e.recurrence_label ? e.recurrence_label : countdown(e.next_occurrence || e.start_time)} colors={colors} />
          {!!e.address && <Row icon="location-outline" color={colors.brand} text={e.address} colors={colors} />}
          {!!e.capacity && e.capacity > 0 && <Row icon="people-outline" color={colors.brand} text={`${e.spots_taken || 0}/${e.capacity}`} colors={colors} />}
          {!!e.rating && e.rating > 0 && <Row icon="star" color="#FFD60A" text={`${e.rating.toFixed(1)} (${e.rating_count})`} colors={colors} />}
          {!!e.description && <Text style={[styles.desc, { color: colors.onSurfaceSecondary }]}>{e.description}</Text>}
          {!cancelled && <DealCard key={e.id} event={e} />}

          <Pressable testID="event-detail-participants" onPress={() => router.push(`/participants/${id}`)} style={[styles.linkBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            {shown.length > 0 ? (
              <View style={styles.avatars} testID="event-detail-avatars">
                {shown.map((p, i) => (
                  <View key={p.user_id} style={[styles.avatar, { marginLeft: i ? -10 : 0, backgroundColor: colors.surfaceSecondary, borderColor: colors.surfaceTertiary }]}>
                    {p.anonymous ? <Ionicons name="person" size={16} color={colors.onSurfaceTertiary} />
                      : p.picture ? <Image source={{ uri: p.picture }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        : <Text style={[styles.avatarText, { color: colors.onSurface }]}>{(p.name || "?").charAt(0).toUpperCase()}</Text>}
                  </View>
                ))}
              </View>
            ) : <Ionicons name="people" size={18} color={colors.brand} />}
            <Text style={[styles.linkText, { color: colors.onSurface }]}>{people ? people.count : e.live_count} {t("attending")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} style={{ marginLeft: "auto" }} />
          </Pressable>

          {canEdit && (
            <Pressable testID="event-detail-cancel" onPress={() => setConfirmCancel(true)} style={[styles.dangerOutline, { borderColor: colors.error }]}>
              <Ionicons name="close-circle-outline" size={20} color={colors.error} />
              <Text style={[styles.dangerOutlineText, { color: colors.error }]}>{t("cancel_event")}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal visible={confirmCancel} transparent animationType="fade" onRequestClose={() => setConfirmCancel(false)}>
        <Pressable style={styles.modalBg} onPress={() => setConfirmCancel(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="warning" size={38} color={colors.error} />
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>{t("cancel_event")}</Text>
            <Text style={[styles.modalBody, { color: colors.onSurfaceTertiary }]}>{t("cancel_event_confirm")}</Text>
            <Pressable testID="confirm-cancel-event" disabled={cancelling} onPress={cancelEvent} style={[styles.dangerBtn, { backgroundColor: colors.error }]}>
              {cancelling ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.dangerBtnText}>{t("cancel_event")}</Text>}
            </Pressable>
            <Pressable testID="keep-event" onPress={() => setConfirmCancel(false)} hitSlop={8} style={{ paddingVertical: 6 }}>
              <Text style={[styles.keepText, { color: colors.onSurfaceTertiary }]}>{t("keep_event")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ActionSheet
        testID="event-more"
        visible={showMore}
        title={e.title}
        onClose={() => setShowMore(false)}
        actions={[
          { key: "report-event", label: t("report_event"), icon: "flag-outline", onPress: () => setReporting(true) },
          { key: "block-host", label: t("block_host"), icon: "ban-outline", danger: true, onPress: () => setConfirmBlock(true) },
        ]}
      />
      <ActionSheet
        testID="block-confirm"
        visible={confirmBlock}
        title={t("block_confirm_title").replace("{name}", e.host_name || t("guest"))}
        message={t("block_confirm_body")}
        onClose={() => setConfirmBlock(false)}
        actions={[{ key: "block-confirm", label: t("block_user"), icon: "ban", danger: true, onPress: blockHost }]}
      />
      {reporting && <ReportSheet target={{ type: "event", id: e.id }} onClose={() => setReporting(false)} />}
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
  roundBtn: { position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroActions: { position: "absolute", right: 16, flexDirection: "row", gap: 10 },
  roundBtnStatic: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroText: { padding: 16, gap: 6 },
  pillRow: { flexDirection: "row", gap: 8 },
  catPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  catPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  venue: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1.5 },
  bannerText: { fontSize: 14, fontWeight: "700", flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  desc: { fontSize: 15, lineHeight: 22 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  linkText: { fontSize: 15, fontWeight: "700" },
  avatars: { flexDirection: "row" },
  avatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { fontSize: 12, fontWeight: "800" },
  dangerOutline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, borderWidth: 1.5, marginTop: 8 },
  dangerOutlineText: { fontSize: 15, fontWeight: "800" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 28 },
  modalCard: { width: "100%", maxWidth: 380, borderRadius: 20, padding: 24, alignItems: "center", gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalBody: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  dangerBtn: { alignSelf: "stretch", height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  dangerBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  keepText: { fontSize: 15, fontWeight: "700" },
});
