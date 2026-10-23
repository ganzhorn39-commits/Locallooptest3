import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "expo-router";
import { useTheme } from "@/src/theme/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";
import { api, EventItem } from "@/src/api/client";
import { filterEvents, QuickKey, sortByTime, topTrending } from "@/src/utils/filters";
import { isMinor } from "@/src/utils/age";
import { useUserLocation } from "@/src/utils/useUserLocation";
import { useNow } from "@/src/hooks/use-now";
import { useFilters } from "@/src/filters/FilterContext";
import EventCard from "@/src/components/EventCard";
import SearchFilterBar from "@/src/components/SearchFilterBar";
import CategoryFilterRow from "@/src/components/CategoryFilterRow";
import FilterButton from "@/src/components/FilterButton";
import FilterSheet from "@/src/components/FilterSheet";
import EventSheet from "@/src/components/EventSheet";
import NotificationBell from "@/src/components/NotificationBell";

export default function ExploreScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<QuickKey[]>([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { userLoc, requestLocation } = useUserLocation();
  const { date, radiusKm, host, activeCount, reset } = useFilters();
  const now = useNow();

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["36%", "90%"], []);

  const load = useCallback(async () => {
    try {
      const [evs, saved] = await Promise.all([api.listEvents(), user ? api.mySaved() : Promise.resolve([])]);
      setEvents(evs);
      setSavedIds(saved.map((s: EventItem) => s.id));
    } catch (e) {
      console.log("explore load error", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const trendingMode = category === "trending";
  const filtered = useMemo(() => {
    const base = filterEvents(events, {
      query, category: trendingMode ? "all" : category, quick, userLoc, radiusKm, hideRestricted: isMinor(user?.birthdate),
      date, host, now,
    });
    return trendingMode ? topTrending(base, 20) : sortByTime(base, now);
  }, [events, query, category, trendingMode, quick, userLoc, radiusKm, user, date, host, now]);

  const openEvent = useCallback(async (e: EventItem) => {
    setSelected(e);
    setCheckedIn(false);
    sheetRef.current?.snapToIndex(0);
    try { setCheckedIn((await api.checkinStatus(e.id)).checked_in); } catch {}
  }, []);

  const onCheckin = useCallback(async (visibility?: string, atVenue?: boolean) => {
    if (!selected) return;
    try {
      const res = await api.checkin(selected.id, { visibility, at_venue: atVenue });
      setCheckedIn(res.checked_in);
      setSelected(res);
      setEvents((prev) => prev.map((ev) => (ev.id === res.id ? res : ev)));
    } catch {}
  }, [selected]);

  const toggleSave = async (id: string) => {
    setSavedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    try { await api.toggleSave(id); } catch { load(); }
  };

  const toggleQuick = (k: QuickKey) => setQuick((q) => (q.includes(k) ? q.filter((x) => x !== k) : [...q, k]));
  const anyFilter = activeCount > 0 || quick.length > 0 || !!query || category !== "all";
  const resetAll = () => { reset(); setQuick([]); setQuery(""); setCategory("all"); };

  const TrendsHeader = trendingMode ? (
    <View style={styles.trendsHead} testID="trends-section">
      <Ionicons name="flame" size={18} color={colors.error} />
      <Text style={[styles.trendsTitle, { color: colors.onSurface }]}>{t("trending_now")}</Text>
      <Text style={[styles.trendsHint, { color: colors.onSurfaceTertiary }]}>· {t("trending_hint")}</Text>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="explore-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.onSurface }]}>{t("explore_title")}</Text>
          <NotificationBell />
        </View>
        <SearchFilterBar query={query} onQuery={setQuery} quick={quick} onToggleQuick={toggleQuick}
          accessory={<FilterButton count={activeCount} onPress={() => setShowFilters(true)} />} />
        <View style={{ marginHorizontal: -16, marginTop: 4 }}>
          <CategoryFilterRow selected={category} onSelect={setCategory} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <EventCard event={item} saved={savedIds.includes(item.id)} onPress={() => openEvent(item)} onToggleSave={() => toggleSave(item.id)} />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ListHeaderComponent={TrendsHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap} testID="explore-empty">
              <Ionicons name={trendingMode ? "flame-outline" : "search"} size={28} color={colors.onSurfaceTertiary} />
              <Text style={[styles.empty, { color: colors.onSurfaceSecondary }]}>{trendingMode ? t("trending_empty") : t("map_empty")}</Text>
              {anyFilter && (
                <Pressable testID="explore-empty-reset" onPress={resetAll} style={[styles.emptyBtn, { borderColor: colors.brand }]}>
                  <Ionicons name="refresh" size={16} color={colors.brand} />
                  <Text style={[styles.emptyBtnText, { color: colors.brand }]}>{t("filters_reset_all")}</Text>
                </Pressable>
              )}
            </View>
          }
          testID="explore-list"
        />
      )}

      <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints} enableDynamicSizing={false} enablePanDownToClose onClose={() => setSelected(null)}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }} backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}>
        {selected && <EventSheet event={selected} checkedIn={checkedIn} onCheckin={onCheckin} bottomInset={0} userLoc={userLoc} />}
      </BottomSheet>

      <FilterSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        events={events}
        resultCount={filtered.length}
        hasLocation={!!userLoc}
        onRequestLocation={requestLocation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, gap: 10 },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trendsHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  trendsTitle: { fontSize: 17, fontWeight: "800" },
  trendsHint: { fontSize: 13 },
  emptyWrap: { alignItems: "center", gap: 12, marginTop: 50, paddingHorizontal: 24 },
  empty: { textAlign: "center", fontSize: 15, lineHeight: 21, fontWeight: "600" },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5 },
  emptyBtnText: { fontSize: 14, fontWeight: "800" },
});
