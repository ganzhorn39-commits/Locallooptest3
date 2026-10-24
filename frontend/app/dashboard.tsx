import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Modal, Platform } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme, ThemeColors } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, Dashboard, DashboardEvent, DashboardRequest } from "@/src/api/client";
import { categoryMeta } from "@/src/constants/categories";
import { getAge } from "@/src/utils/age";
import { formatWhen } from "@/src/utils/eventTime";
import GuestGate from "@/src/components/GuestGate";

// Host overview: real check-ins, saves, ratings and open join requests for the events this account created.
export default function DashboardScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const locale = lang === "de" ? "de-DE" : "en-US";
  const isBiz = user?.account_type === "business";

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [manage, setManage] = useState<DashboardEvent | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [range, setRange] = useState<7 | 30>(7);
  const [metric, setMetric] = useState<"views" | "checkins">("views");

  const load = useCallback(async () => {
    try {
      setData(await api.myDashboard(range));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useFocusEffect(useCallback(() => { if (user) load(); }, [load, user]));

  const closeManage = () => { setManage(null); setConfirmCancel(false); };
  const openPath = (path: string) => { closeManage(); router.push(path as any); };

  const decide = async (r: DashboardRequest, approve: boolean) => {
    const key = `${r.event_id}:${r.user_id}`;
    setBusy(key); setActionError("");
    try {
      if (approve) await api.approveRequest(r.event_id, r.user_id);
      else await api.rejectRequest(r.event_id, r.user_id);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(approve ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      setActionError(t("dash_action_failed"));
    } finally {
      await load();
      setBusy(null);
    }
  };

  const cancelEvent = async () => {
    if (!manage) return;
    setBusy(manage.id); setActionError("");
    try {
      await api.cancelEvent(manage.id);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      setActionError(t("dash_action_failed"));
    } finally {
      closeManage();
      await load();
      setBusy(null);
    }
  };

  const when = (e: DashboardEvent) => {
    if (isNaN(new Date(e.next_occurrence || e.start_time).getTime())) return "";
    return formatWhen(e as any, t, lang); // date + time (range); series: "Jede Woche · Fr · 20:00"
  };

  const title = isBiz ? t("dashboard_business") : t("dashboard_my_events");
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
      <Pressable testID="dashboard-back" onPress={() => router.back()} hitSlop={8} style={styles.headerSide}>
        <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.onSurface }]} numberOfLines={1}>{title}</Text>
      <Pressable testID="dashboard-create" onPress={() => router.push("/(tabs)/create")} hitSlop={8} style={[styles.headerSide, { alignItems: "flex-end" }]}>
        <Ionicons name="add-circle-outline" size={26} color={colors.brand} />
      </Pressable>
    </View>
  );

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]} testID="dashboard-screen">
        {header}
        <GuestGate icon="briefcase-outline" message={t("wall_title")} />
      </View>
    );
  }

  if (loading || (!data && !loadFailed)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]} testID="dashboard-screen">
        {header}
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]} testID="dashboard-screen">
        {header}
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.onSurfaceTertiary} />
          <Text style={[styles.emptyBody, { color: colors.onSurfaceSecondary }]}>{t("dash_load_failed")}</Text>
          <Pressable testID="dashboard-retry" onPress={() => { setLoading(true); load(); }} style={[styles.primaryBtn, { backgroundColor: colors.brand }]}>
            <Text style={[styles.primaryBtnText, { color: colors.onBrand }]}>{t("retry")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const { totals } = data;
  const bizCat = user.business_category ? categoryMeta(user.business_category) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="dashboard-screen">
      {header}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {isBiz && (
          <View testID="dashboard-business-card" style={[styles.bizCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={[styles.bizIcon, { backgroundColor: bizCat ? bizCat.color : colors.brandTertiary }]}>
              {bizCat ? <Text style={{ fontSize: 22 }}>{bizCat.emoji}</Text> : <Ionicons name="briefcase" size={22} color={colors.brand} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.inlineRow}>
                <Text style={[styles.bizName, { color: colors.onSurface }]} numberOfLines={1}>{user.business_name || user.name}</Text>
                {user.verified && <Ionicons name="checkmark-circle" size={17} color={colors.brand} />}
              </View>
              {!!(bizCat || user.business_address) && (
                <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                  {[bizCat ? t(`cat_${bizCat.key}`) : "", user.business_address || ""].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
          </View>
        )}

        {!!actionError && <Text testID="dashboard-action-error" style={[styles.errorText, { color: colors.error }]}>{actionError}</Text>}

        {totals.events === 0 ? (
          <View testID="dashboard-empty" style={[styles.emptyCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="calendar-outline" size={30} color={colors.brand} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>{t("dash_empty_title")}</Text>
            <Text style={[styles.emptyBody, { color: colors.onSurfaceTertiary }]}>{t("dash_empty_body")}</Text>
            <Pressable testID="dashboard-empty-create" onPress={() => router.push("/(tabs)/create")} style={[styles.primaryBtn, { backgroundColor: colors.brand }]}>
              <Ionicons name="add" size={20} color={colors.onBrand} />
              <Text style={[styles.primaryBtnText, { color: colors.onBrand }]}>{t("dash_create_event")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statGrid}>
              <Stat testID="stat-active" colors={colors} icon="calendar" iconColor={colors.brand}
                label={t("dash_active_events")} value={String(totals.active_events)}
                sub={t("dash_of_total").replace("{n}", String(totals.events))} />
              <Stat testID="stat-checkins" colors={colors} icon="people" iconColor={colors.accent}
                label={t("dash_checkins")} value={totals.checkins.toLocaleString(locale)}
                sub={t("dash_last_7_days").replace("{n}", String(totals.checkins_7d))} />
              <Stat testID="stat-views" colors={colors} icon="eye" iconColor={colors.brand}
                label={t("dash_views")} value={(totals.views || 0).toLocaleString(locale)}
                sub={t("dash_in_days").replace("{n}", String(totals.views_period || 0)).replace("{d}", String(totals.days || range))} />
              <Stat testID="stat-saves" colors={colors} icon="bookmark" iconColor={colors.brand}
                label={t("dash_saves")} value={totals.saves.toLocaleString(locale)} sub={t("dash_saves_sub")} />
              <Stat testID="stat-rating" colors={colors} icon="star" iconColor="#FFD60A"
                label={t("dash_rating")} value={totals.rating_count ? totals.rating.toFixed(1) : "–"}
                sub={totals.rating_count
                  ? `${totals.rating_count.toLocaleString(locale)} ${totals.rating_count === 1 ? t("review_one") : t("reviews")}`
                  : t("dash_no_rating")} />
            </View>

            {(isBiz || totals.offers > 0) && (
              <View testID="dashboard-deals" style={[styles.dealsCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={styles.inlineRow}>
                  <View style={[styles.dealsIcon, { backgroundColor: colors.accent }]}>
                    <Ionicons name="gift" size={18} color={colors.onAccent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.onSurface }]}>{t("deals")}</Text>
                    <Text testID="dashboard-deals-sub" style={[styles.rowSub, { color: colors.onSurfaceTertiary }]}>
                      {totals.offers > 0
                        ? t("dash_deals_sub").replace("{c}", String(totals.deals_claimed)).replace("{r}", String(totals.deals_redeemed))
                        : t("dash_deals_hint")}
                    </Text>
                  </View>
                </View>
                {totals.offers > 0 && (
                  <Pressable testID="dashboard-scan" onPress={() => router.push("/scan-deal")} style={[styles.primaryBtn, styles.scanBtn, { backgroundColor: colors.accent }]}>
                    <Ionicons name="scan" size={20} color={colors.onAccent} />
                    <Text style={[styles.primaryBtnText, { color: colors.onAccent }]}>{t("dash_scan")}</Text>
                  </Pressable>
                )}
              </View>
            )}

            {data.requests.length > 0 && (
              <View style={styles.section} testID="dashboard-requests">
                <Text style={[styles.sectionTitle, { color: colors.onSurfaceTertiary }]}>
                  {totals.pending_requests} {t(totals.pending_requests === 1 ? "dash_open_requests_one" : "dash_open_requests_other")}
                </Text>
                {data.requests.map((r) => {
                  const key = `${r.event_id}:${r.user_id}`;
                  const age = getAge(r.birthdate);
                  const working = busy === key;
                  return (
                    <View key={key} testID={`request-${r.event_id}-${r.user_id}`} style={[styles.requestCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.accent }]}>
                      <Pressable testID={`request-user-${r.user_id}`} onPress={() => router.push(`/user/${r.user_id}`)} style={styles.inlineRow}>
                        <Avatar picture={r.picture} name={r.name} colors={colors} />
                        <View style={{ flex: 1 }}>
                          <View style={styles.inlineRow}>
                            <Text style={[styles.rowTitle, { color: colors.onSurface, flexShrink: 1 }]} numberOfLines={1}>
                              {r.name || t("guest")}{age !== null ? `, ${age}` : ""}
                            </Text>
                            {r.identity_verified && <Ionicons name="shield-checkmark" size={14} color="#4DA3FF" />}
                          </View>
                          <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{t("dash_for")} {r.event_title}</Text>
                        </View>
                      </Pressable>
                      <View style={styles.requestActions}>
                        <Pressable testID={`reject-${r.event_id}-${r.user_id}`} disabled={working} onPress={() => decide(r, false)}
                          style={[styles.outlineBtn, { borderColor: colors.border, opacity: working ? 0.5 : 1 }]}>
                          <Ionicons name="close" size={18} color={colors.error} />
                          <Text style={[styles.btnText, { color: colors.onSurface }]}>{t("reject")}</Text>
                        </Pressable>
                        <Pressable testID={`approve-${r.event_id}-${r.user_id}`} disabled={working} onPress={() => decide(r, true)}
                          style={[styles.filledBtn, { backgroundColor: colors.success, opacity: working ? 0.5 : 1 }]}>
                          {working ? <ActivityIndicator color={colors.onAccent} /> : (
                            <>
                              <Ionicons name="checkmark" size={18} color={colors.onAccent} />
                              <Text style={[styles.btnText, { color: colors.onAccent }]}>{t("approve")}</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.chartHead}>
                <Text style={[styles.sectionTitle, { color: colors.onSurfaceTertiary }]}>{t("dash_stats_title")}</Text>
                <View style={[styles.seg, { backgroundColor: colors.surfaceTertiary }]}>
                  {([7, 30] as const).map((d) => (
                    <Pressable key={d} testID={`dash-range-${d}`} onPress={() => { setRange(d); setLoading(true); }}
                      style={[styles.segBtn, range === d && { backgroundColor: colors.brand }]}>
                      <Text style={[styles.segText, { color: range === d ? colors.onBrand : colors.onSurface }]}>{t("dash_days").replace("{n}", String(d))}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={[styles.seg, { backgroundColor: colors.surfaceTertiary, alignSelf: "flex-start" }]}>
                {(["views", "checkins"] as const).map((m) => (
                  <Pressable key={m} testID={`dash-metric-${m}`} onPress={() => setMetric(m)} style={[styles.segBtn, metric === m && { backgroundColor: colors.surfaceInverse }]}>
                    <Text style={[styles.segText, { color: metric === m ? colors.onSurfaceInverse : colors.onSurface }]}>{m === "views" ? t("dash_views") : t("dash_checkins")}</Text>
                  </Pressable>
                ))}
              </View>
              <WeekChart
                days={(data.stats_by_day || data.checkins_by_day.map((d) => ({ date: d.date, checkins: d.count, views: 0 })))
                  .map((d) => ({ date: d.date, count: metric === "views" ? d.views : d.checkins }))}
                colors={colors} locale={locale} emptyText={metric === "views" ? t("dash_views_empty") : t("dash_chart_empty")}
              />
              {(totals.views_period || 0) > 0 && (
                <Text testID="dash-conversion" style={[styles.convText, { color: colors.onSurfaceSecondary }]}>
                  {/* the share only means something once views are counted longer than the check-ins (new feature) */}
                  {t((totals.checkins_period ?? 0) <= (totals.views_period || 0) ? "dash_conversion" : "dash_conversion_plain")
                    .replace("{v}", String(totals.views_period || 0))
                    .replace("{c}", String(totals.checkins_period ?? 0))
                    .replace("{p}", String(Math.round(((totals.checkins_period ?? 0) / Math.max(1, totals.views_period || 0)) * 100)))}
                </Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.onSurfaceTertiary }]}>{t("dash_your_events")} · {totals.events}</Text>
              {data.events.map((e) => {
                const meta = categoryMeta(e.category);
                const dimmed = e.phase !== "upcoming";
                return (
                  <Pressable key={e.id} testID={`dashboard-event-${e.id}`} onPress={() => setManage(e)}
                    style={[styles.eventRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <View style={[styles.eventAvatar, { backgroundColor: meta.color, opacity: dimmed ? 0.5 : 1 }]}>
                      <Text style={{ fontSize: 20 }}>{e.emoji || meta.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={styles.inlineRow}>
                        <Text style={[styles.rowTitle, { color: dimmed ? colors.onSurfaceTertiary : colors.onSurface, flexShrink: 1 }]} numberOfLines={1}>{e.title}</Text>
                        {e.phase === "cancelled" && <Badge text={t("cancelled_badge")} color={colors.error} />}
                        {e.phase === "past" && <Badge text={t("dash_past")} color={colors.onSurfaceTertiary} />}
                        {e.is_live && e.phase === "upcoming" && <Badge text={t("live_now")} color="#FF3B30" />}
                      </View>
                      <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{when(e)}</Text>
                      <View style={styles.metricRow}>
                        <Metric icon="people" colors={colors} text={e.capacity > 0 ? `${e.checkins}/${e.capacity}` : String(e.checkins)} />
                        <Metric icon="eye" colors={colors} text={String(e.views ?? 0)} />
                        <Metric icon="bookmark" colors={colors} text={String(e.saves)} />
                        {e.rating_count > 0 && <Metric icon="star" iconColor="#FFD60A" colors={colors} text={`${e.rating.toFixed(1)} (${e.rating_count})`} />}
                        {!!e.offer_title && (
                          <Metric icon="gift" iconColor={colors.accent} colors={colors}
                            text={e.offer_limit ? `${e.deals_claimed}/${e.offer_limit}` : String(e.deals_claimed)} />
                        )}
                        {e.pending_requests > 0 && (
                          <View style={[styles.pill, { backgroundColor: colors.accent }]}>
                            <Text style={[styles.pillText, { color: colors.onAccent }]}>
                              {e.pending_requests} {t(e.pending_requests === 1 ? "dash_request_one" : "dash_request_other")}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.onSurfaceTertiary} />
                  </Pressable>
                );
              })}
            </View>

            {data.recent_reviews.length > 0 && (
              <View style={styles.section} testID="dashboard-reviews">
                <Text style={[styles.sectionTitle, { color: colors.onSurfaceTertiary }]}>{t("dash_latest_reviews")}</Text>
                {data.recent_reviews.map((rv) => (
                  <View key={rv.id} testID={`dashboard-review-${rv.id}`} style={[styles.reviewRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <View style={styles.reviewHead}>
                      <Text style={[styles.rowTitle, { color: colors.onSurface, flexShrink: 1 }]} numberOfLines={1}>{rv.user_name}</Text>
                      <View style={{ flexDirection: "row" }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Ionicons key={s} name={s <= rv.rating ? "star" : "star-outline"} size={13} color="#FFD60A" />
                        ))}
                      </View>
                    </View>
                    {!!rv.comment && <Text style={[styles.reviewComment, { color: colors.onSurfaceSecondary }]}>{rv.comment}</Text>}
                    <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{rv.event_title}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!manage} transparent animationType="fade" onRequestClose={closeManage}>
        <Pressable style={styles.sheetBg} onPress={closeManage} testID="manage-backdrop">
          <Pressable style={[styles.sheet, { backgroundColor: colors.surfaceSecondary, paddingBottom: insets.bottom + 28 }]}>
            {manage && !confirmCancel && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.onSurface }]} numberOfLines={2}>{manage.title}</Text>
                <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary, marginBottom: 4 }]}>{t("dash_manage")}</Text>
                {manage.phase !== "cancelled" && (
                  <SheetOption testID="manage-edit" icon="create-outline" label={t("edit_event")} colors={colors} onPress={() => openPath(`/edit-event/${manage.id}`)} />
                )}
                <SheetOption testID="manage-view" icon="eye-outline" label={t("dash_view_event")} colors={colors} onPress={() => openPath(`/event/${manage.id}`)} />
                <SheetOption testID="manage-participants" icon="people-outline" label={t("attendees")} colors={colors} onPress={() => openPath(`/participants/${manage.id}`)} />
                {manage.phase !== "cancelled" && (
                  <SheetOption testID="manage-cancel" icon="close-circle-outline" label={t("cancel_event")} colors={colors} danger onPress={() => setConfirmCancel(true)} />
                )}
              </>
            )}
            {manage && confirmCancel && (
              <View style={{ alignItems: "center", gap: 10 }}>
                <Ionicons name="warning" size={38} color={colors.error} />
                <Text style={[styles.sheetTitle, { color: colors.onSurface, textAlign: "center" }]}>{t("cancel_event")}</Text>
                <Text style={[styles.emptyBody, { color: colors.onSurfaceTertiary }]}>{t("cancel_event_confirm")}</Text>
                <Pressable testID="confirm-cancel-event" disabled={!!busy} onPress={cancelEvent} style={[styles.dangerBtn, { backgroundColor: colors.error }]}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.dangerText}>{t("cancel_event")}</Text>}
                </Pressable>
                <Pressable testID="keep-event" onPress={() => setConfirmCancel(false)} hitSlop={8} style={{ paddingVertical: 6 }}>
                  <Text style={[styles.btnText, { color: colors.onSurfaceTertiary }]}>{t("keep_event")}</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Stat({ testID, colors, icon, iconColor, label, value, sub }: {
  testID: string; colors: ThemeColors; icon: string; iconColor: string; label: string; value: string; sub: string;
}) {
  return (
    <View testID={testID} style={[styles.stat, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <View style={styles.inlineRow}>
        <Ionicons name={icon as any} size={15} color={iconColor} />
        <Text style={[styles.statLabel, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: colors.onSurface }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statSub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

function WeekChart({ days, colors, locale, emptyText }: {
  days: { date: string; count: number }[]; colors: ThemeColors; locale: string; emptyText: string;
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const dense = days.length > 10; // 30 days: thin bars, a date every 5 days
  return (
    <View testID="dashboard-chart" style={[styles.chartCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <View style={styles.bars}>
        {days.map((d, i) => {
          const today = i === days.length - 1;
          const [y, m, dd] = d.date.split("-").map(Number);
          const date = new Date(y, m - 1, dd);
          const label = dense
            ? ((days.length - 1 - i) % 5 === 0 ? `${dd}.` : "")
            : date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "");
          return (
            <View key={d.date} style={styles.barCol} testID={`chart-day-${d.date}`}>
              <Text style={[styles.barValue, { color: d.count && !dense ? colors.onSurface : "transparent" }]}>{d.count}</Text>
              <View style={[styles.bar, dense && { width: 6, borderRadius: 3 }, d.count
                ? { height: Math.max(8, Math.round((d.count / max) * 72)), backgroundColor: colors.brand, opacity: today ? 1 : 0.5 }
                : { height: 3, backgroundColor: colors.borderStrong }]} />
              <Text numberOfLines={1} style={[styles.barLabel, dense && { fontSize: 10, width: 24, textAlign: "center" }, { color: today ? colors.onSurface : colors.onSurfaceTertiary, fontWeight: today ? "800" : "600" }]}>{label}</Text>
            </View>
          );
        })}
      </View>
      {total === 0 && <Text style={[styles.chartEmpty, { color: colors.onSurfaceTertiary }]}>{emptyText}</Text>}
    </View>
  );
}

function Avatar({ picture, name, colors }: { picture?: string; name?: string; colors: ThemeColors }) {
  return (
    <View style={[styles.personAvatar, { backgroundColor: colors.surfaceTertiary }]}>
      {picture ? (
        <Image source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={[styles.personInitial, { color: colors.onSurface }]}>{(name || "?").charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

function Metric({ icon, iconColor, text, colors }: { icon: string; iconColor?: string; text: string; colors: ThemeColors }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon as any} size={13} color={iconColor || colors.onSurfaceTertiary} />
      <Text style={[styles.metricText, { color: colors.onSurfaceSecondary }]}>{text}</Text>
    </View>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

function SheetOption({ testID, icon, label, onPress, colors, danger }: {
  testID: string; icon: string; label: string; onPress: () => void; colors: ThemeColors; danger?: boolean;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.sheetOption, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
      <Ionicons name={icon as any} size={22} color={danger ? colors.error : colors.brand} />
      <Text style={[styles.sheetOptionText, { color: danger ? colors.error : colors.onSurface }]}>{label}</Text>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} style={{ marginLeft: "auto" }} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerSide: { width: 32 },
  headerTitle: { fontSize: 18, fontWeight: "800", flex: 1, textAlign: "center" },
  body: { padding: 16, gap: 18 },
  centered: { alignItems: "center", gap: 12, padding: 32, marginTop: 40 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bizCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  bizIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bizName: { fontSize: 17, fontWeight: "800", flexShrink: 1 },
  errorText: { fontSize: 14, fontWeight: "600" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { flexGrow: 1, flexBasis: "45%", padding: 14, borderRadius: 16, borderWidth: 1, gap: 4 },
  statLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 1 },
  statValue: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  statSub: { fontSize: 12 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  requestCard: { padding: 12, borderRadius: 16, borderWidth: 1.5, gap: 12 },
  requestActions: { flexDirection: "row", gap: 10 },
  outlineBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12, borderWidth: 1 },
  filledBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12 },
  btnText: { fontSize: 15, fontWeight: "700" },
  personAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  personInitial: { fontSize: 16, fontWeight: "800" },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 13 },
  chartCard: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 8 },
  bars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 116 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4 },
  bar: { width: 18, borderRadius: 6 },
  barValue: { fontSize: 12, fontWeight: "800" },
  barLabel: { fontSize: 11, textTransform: "capitalize" },
  chartEmpty: { fontSize: 13, textAlign: "center" },
  chartHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seg: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  segBtn: { paddingHorizontal: 12, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segText: { fontSize: 13, fontWeight: "800" },
  convText: { fontSize: 13, fontWeight: "600" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  eventAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  metricRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 2 },
  metric: { flexDirection: "row", alignItems: "center", gap: 4 },
  metricText: { fontSize: 13, fontWeight: "700" },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: "800" },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  reviewRow: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 4 },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  reviewComment: { fontSize: 14, lineHeight: 20 },
  emptyCard: { alignItems: "center", gap: 10, padding: 24, borderRadius: 18, borderWidth: 1 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, paddingHorizontal: 24, marginTop: 6 },
  primaryBtnText: { fontSize: 16, fontWeight: "800" },
  dealsCard: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  dealsIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  scanBtn: { alignSelf: "stretch", marginTop: 0 },
  sheetBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 10 },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  sheetOptionText: { fontSize: 15, fontWeight: "700" },
  dangerBtn: { alignSelf: "stretch", height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
  dangerText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
