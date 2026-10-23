import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, ApiError, Deal, EventItem } from "@/src/api/client";
import { dealStatusText } from "@/src/utils/deals";
import { isPast } from "@/src/utils/eventTime";

// Same rule as the backend: deals of a one-off event can be claimed until 2 hours after its end.
const eventIsOver = (event: EventItem) => isPast(event);

/**
 * The business offer of an event ("10 % auf Kaffee"): attendees claim it once, the host sees how many are gone.
 * `checkedIn` comes from the parent when it already knows it; otherwise the card asks the API itself.
 * Parents render it with key={event.id}, so switching events starts with a fresh card.
 */
export default function DealCard({ event, checkedIn }: { event: EventItem; checkedIn?: boolean }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user, promptLogin } = useAuth();
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [fetchedCheckin, setFetchedCheckin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; attending: boolean } | null>(null);

  const isHost = !!user && user.user_id === event.created_by;
  const attending = checkedIn ?? fetchedCheckin;

  // Re-read the own deal whenever the check-in changes: leaving the event gives an unused deal back.
  useEffect(() => {
    if (!user || !event.offer_title) return;
    let alive = true;
    api.myEventDeal(event.id).then((r) => { if (alive) setDeal(r.deal); }).catch(() => {});
    if (checkedIn === undefined) {
      api.checkinStatus(event.id).then((s) => { if (alive) setFetchedCheckin(s.checked_in); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [user, event.id, event.offer_title, checkedIn]);

  if (!event.offer_title && !deal) return null;

  const limit = event.offer_limit || 0;
  const claimed = event.offer_claimed || 0;
  const left = Math.max(0, limit - claimed);
  const soldOut = limit > 0 && left === 0;
  const over = eventIsOver(event);
  const errorText = error && error.attending === attending ? error.text : "";

  const claim = async () => {
    if (!user) { promptLogin(); return; }
    setBusy(true); setError(null);
    try {
      setDeal(await api.claimDeal(event.id));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const err = e as ApiError;
      const detail = String(err.detail || "");
      const text = detail.includes("sold out") ? t("deal_sold_out") : detail.includes("over") ? t("deal_over")
        : err.status === 403 ? t("deal_checkin_first") : t("deal_failed");
      setError({ text, attending });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setBusy(false); }
  };

  const sub = deal
    ? (deal.status === "active" ? t("deal_where") : dealStatusText(deal, t, lang))
    : isHost
      ? (limit ? `${t("deal_claimed_count").replace("{n}", String(claimed))} / ${limit}` : t("deal_claimed_count").replace("{n}", String(claimed)))
      : limit ? t("deal_left").replace("{n}", String(left)).replace("{m}", String(limit)) : t("deal_unlimited");

  return (
    <View testID="deal-card" style={[styles.card, { backgroundColor: colors.surfaceTertiary, borderColor: deal?.status === "active" ? colors.accent : colors.border }]}>
      <View style={styles.head}>
        <View style={[styles.gift, { backgroundColor: colors.accent }]}>
          <Ionicons name="gift" size={18} color={colors.onAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.accent }]}>{deal ? t("deal_claimed") : t("deal_label")}</Text>
          <Text testID="deal-title" style={[styles.title, { color: colors.onSurface }]}>{deal ? deal.offer_title : event.offer_title}</Text>
          <Text testID="deal-sub" style={[styles.sub, { color: colors.onSurfaceTertiary }]}>{sub}</Text>
        </View>
      </View>

      {deal ? (
        <Pressable testID="deal-show-qr" onPress={() => router.push("/deals")} style={[styles.btn, { backgroundColor: colors.accent }]}>
          <Ionicons name="qr-code" size={18} color={colors.onAccent} />
          <Text style={[styles.btnText, { color: colors.onAccent }]}>{t("deal_show_qr")}</Text>
        </Pressable>
      ) : isHost ? null : over ? (
        <Text style={[styles.note, { color: colors.onSurfaceTertiary }]}>{t("deal_over")}</Text>
      ) : soldOut ? (
        <Text testID="deal-sold-out" style={[styles.note, { color: colors.error }]}>{t("deal_sold_out")}</Text>
      ) : user && !attending ? (
        <Text testID="deal-checkin-first" style={[styles.note, { color: colors.onSurfaceTertiary }]}>{t("deal_checkin_first")}</Text>
      ) : (
        <Pressable testID="deal-claim" onPress={claim} disabled={busy} style={[styles.btn, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.onAccent} /> : (
            <>
              <Ionicons name="gift-outline" size={18} color={colors.onAccent} />
              <Text style={[styles.btnText, { color: colors.onAccent }]}>{t("deal_claim")}</Text>
            </>
          )}
        </Pressable>
      )}
      {!!errorText && <Text testID="deal-error" style={[styles.note, { color: colors.error }]}>{errorText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 12 },
  head: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  gift: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 17, fontWeight: "900", marginTop: 2 },
  sub: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12 },
  btnText: { fontSize: 15, fontWeight: "800" },
  note: { fontSize: 13, fontWeight: "600", textAlign: "center" },
});
