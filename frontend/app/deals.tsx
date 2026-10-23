import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { api, Deal } from "@/src/api/client";
import QRCode from "@/src/components/QRCode";
import { dealStatusText, formatDealCode } from "@/src/utils/deals";

// "Meine Deals": every claimed offer; usable ones show their QR code for the business to scan.
export default function DealsScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setDeals(await api.myDeals()); } catch { setDeals((d) => d ?? []); } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const when = (d: Deal) => {
    if (d.is_recurring && d.recurrence_label) return d.recurrence_label;
    const iso = d.next_occurrence || d.start_time;
    if (!iso) return "";
    const date = new Date(iso);
    const locale = lang === "de" ? "de-DE" : "en-US";
    return `${date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} · ${date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="deals-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="deals-back" onPress={() => router.back()} hitSlop={8} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t("my_deals")}</Text>
        <View style={{ width: 26 }} />
      </View>

      {deals === null ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {deals.length === 0 ? (
            <View testID="deals-empty" style={[styles.empty, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="gift-outline" size={30} color={colors.brand} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>{t("deals_empty_title")}</Text>
              <Text style={[styles.emptyBody, { color: colors.onSurfaceTertiary }]}>{t("deals_empty_body")}</Text>
            </View>
          ) : (
            deals.map((d) => {
              const active = d.status === "active";
              return (
                <View key={d.id} testID={`deal-${d.id}`} style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: active ? colors.accent : colors.border }]}>
                  <View style={styles.cardHead}>
                    <View style={[styles.gift, { backgroundColor: active ? colors.accent : colors.surfaceTertiary }]}>
                      <Ionicons name="gift" size={20} color={active ? colors.onAccent : colors.onSurfaceTertiary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.offer, { color: active ? colors.onSurface : colors.onSurfaceTertiary }]}>{d.offer_title}</Text>
                      <Text style={[styles.sub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                        {[d.business_name, d.event_title].filter(Boolean).join(" · ")}
                      </Text>
                      <Text style={[styles.sub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{when(d)}</Text>
                    </View>
                  </View>

                  {active ? (
                    <View style={styles.qrWrap}>
                      <QRCode value={d.qr} size={210} testID={`deal-qr-${d.id}`} />
                      <Text testID={`deal-code-${d.id}`} style={[styles.code, { color: colors.onSurface }]}>{formatDealCode(d.code)}</Text>
                      <Text style={[styles.hint, { color: colors.onSurfaceTertiary }]}>
                        {t("deal_show_at").replace("{name}", d.business_name || d.event_title)}
                      </Text>
                    </View>
                  ) : (
                    <View testID={`deal-status-${d.id}`} style={[styles.statusPill, { borderColor: d.status === "redeemed" ? colors.success : colors.borderStrong }]}>
                      <Ionicons name={d.status === "redeemed" ? "checkmark-circle" : d.status === "cancelled" ? "close-circle" : "time-outline"}
                        size={16} color={d.status === "redeemed" ? colors.success : colors.onSurfaceTertiary} />
                      <Text style={[styles.statusText, { color: d.status === "redeemed" ? colors.success : colors.onSurfaceTertiary }]}>{dealStatusText(d, t, lang)}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  body: { padding: 16, gap: 14 },
  empty: { alignItems: "center", gap: 10, padding: 24, borderRadius: 18, borderWidth: 1 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  card: { padding: 16, borderRadius: 18, borderWidth: 1.5, gap: 14 },
  cardHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  gift: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  offer: { fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  sub: { fontSize: 13, marginTop: 2 },
  qrWrap: { alignItems: "center", gap: 10 },
  code: { fontSize: 22, fontWeight: "900", letterSpacing: 3, fontVariant: ["tabular-nums"] },
  hint: { fontSize: 13, textAlign: "center" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 13, fontWeight: "700" },
});
