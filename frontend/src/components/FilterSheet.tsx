import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Calendar } from "react-native-calendars";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useFilters } from "@/src/filters/FilterContext";
import { useNow } from "@/src/hooks/use-now";
import RadiusFilter from "@/src/components/RadiusFilter";
import { DateFilter, eventDays, formatDay, localISODate, parseLocalDate } from "@/src/utils/eventTime";
import type { EventItem } from "@/src/api/client";

const QUICK_DATES: DateFilter["kind"][] = ["all", "today", "tomorrow", "weekend"];
const CALENDAR_DAYS = 60; // recurring events list their dates this far ahead

// Filter sheet for map and explore: date (quick tabs + calendar), distance, host type.
// `resultCount` is the number of events the current filters leave; the button shows it.
export default function FilterSheet({ visible, onClose, events, resultCount, hasLocation, onRequestLocation }: {
  visible: boolean;
  onClose: () => void;
  events: EventItem[];
  resultCount: number;
  hasLocation: boolean;
  onRequestLocation?: () => void;
}) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const { date, setDate, radiusKm, setRadiusKm, host, setHost, reset, activeCount } = useFilters();
  const [showCal, setShowCal] = useState(false);

  const now = useNow();
  const tick = () => { if (Platform.OS !== "web") Haptics.selectionAsync(); };
  const today = localISODate(new Date(now));
  const maxDate = localISODate(new Date(now + CALENDAR_DAYS * 86400000));
  const marked = useMemo(() => {
    if (!visible) return {};
    const out: Record<string, any> = {};
    eventDays(events, now).forEach((d) => { out[d] = { marked: true, dotColor: colors.brand }; });
    if (date.kind === "date") out[date.date] = { ...(out[date.date] || {}), selected: true, selectedColor: colors.brand };
    return out;
  }, [visible, events, date, colors.brand, now]);

  const chip = (key: string, label: string, active: boolean, onPress: () => void, icon?: string) => (
    <Pressable key={key} testID={`filter-date-${key}`} onPress={() => { tick(); onPress(); }}
      style={[styles.chip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}>
      {!!icon && <Ionicons name={icon as any} size={15} color={active ? colors.onBrand : colors.onSurface} />}
      <Text style={[styles.chipText, { color: active ? colors.onBrand : colors.onSurface }]}>{label}</Text>
    </Pressable>
  );

  const showLabel = t(resultCount === 1 ? "filter_show_one" : "filter_show_many").replace("{n}", String(resultCount));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.bg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="filter-backdrop" />
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, paddingBottom: insets.bottom + 14 }]} testID="filter-sheet">
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
          <View style={styles.headRow}>
            <Text style={[styles.title, { color: colors.onSurface }]}>{t("filters_title")}</Text>
            {activeCount > 0 && (
              <Pressable testID="filter-reset" onPress={() => { tick(); reset(); setShowCal(false); }} hitSlop={8}>
                <Text style={[styles.reset, { color: colors.brand }]}>{t("filters_reset")}</Text>
              </Pressable>
            )}
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
            <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>{t("filter_date")}</Text>
            <View style={styles.chips}>
              {QUICK_DATES.map((k) => chip(k, t(`filter_date_${k}`), date.kind === k, () => { setDate({ kind: k } as DateFilter); setShowCal(false); }))}
              {chip("pick", date.kind === "date" ? formatDay(parseLocalDate(date.date).getTime(), lang) : t("filter_pick_date"),
                date.kind === "date", () => setShowCal((s) => !s), "calendar-outline")}
            </View>
            {showCal && (
              <View style={[styles.calWrap, { borderColor: colors.border }]}>
                <Calendar
                  key={lang}
                  testID="filter-calendar"
                  current={date.kind === "date" ? date.date : today}
                  minDate={today}
                  maxDate={maxDate}
                  firstDay={1}
                  onDayPress={(d: any) => { tick(); setDate({ kind: "date", date: d.dateString }); setShowCal(false); }}
                  markedDates={marked}
                  theme={{
                    calendarBackground: colors.surfaceSecondary,
                    dayTextColor: colors.onSurface,
                    monthTextColor: colors.onSurface,
                    textDisabledColor: colors.onSurfaceTertiary + "88",
                    textSectionTitleColor: colors.onSurfaceTertiary,
                    arrowColor: colors.brand,
                    todayTextColor: colors.brand,
                    selectedDayBackgroundColor: colors.brand,
                    selectedDayTextColor: colors.onBrand,
                    dotColor: colors.brand,
                  }}
                />
              </View>
            )}

            <Text style={[styles.section, { color: colors.onSurfaceTertiary, marginTop: 8 }]}>{t("radius")}</Text>
            {hasLocation ? (
              <RadiusFilter plain value={radiusKm} onChange={setRadiusKm} />
            ) : (
              <View testID="filter-location-hint" style={[styles.hint, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
                <Ionicons name="navigate-outline" size={18} color={colors.onSurfaceTertiary} />
                <Text style={[styles.hintText, { color: colors.onSurfaceSecondary }]}>{t("filter_radius_needs_location")}</Text>
                {Platform.OS !== "web" && !!onRequestLocation && (
                  <Pressable testID="filter-allow-location" onPress={onRequestLocation} hitSlop={6}>
                    <Text style={[styles.reset, { color: colors.brand }]}>{t("filter_allow_location")}</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Text style={[styles.section, { color: colors.onSurfaceTertiary, marginTop: 8 }]}>{t("filter_host")}</Text>
            <View style={[styles.segment, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
              {(["all", "business"] as const).map((h) => {
                const active = host === h;
                return (
                  <Pressable key={h} testID={`filter-host-${h}`} onPress={() => { tick(); setHost(h); }}
                    style={[styles.segmentBtn, active && { backgroundColor: colors.brand }]}>
                    <Ionicons name={h === "all" ? "globe-outline" : "storefront-outline"} size={16} color={active ? colors.onBrand : colors.onSurface} />
                    <Text style={[styles.segmentText, { color: active ? colors.onBrand : colors.onSurface }]}>{t(`filter_host_${h}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Pressable testID="filter-apply" onPress={onClose} style={[styles.apply, { backgroundColor: colors.brand }]}>
            <Text style={[styles.applyText, { color: colors.onBrand }]}>{showLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  card: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, maxHeight: "88%", gap: 12 },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginBottom: 2 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "900" },
  reset: { fontSize: 14, fontWeight: "800" },
  section: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: "700" },
  calWrap: { borderRadius: 16, borderWidth: 1, overflow: "hidden", paddingBottom: 4 },
  hint: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, flexWrap: "wrap" },
  hintText: { flex: 1, minWidth: 180, fontSize: 13, lineHeight: 18 },
  segment: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 10 },
  segmentText: { fontSize: 14, fontWeight: "800" },
  apply: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  applyText: { fontSize: 16, fontWeight: "800" },
});
