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
import { filterEvents, QuickKey, topTrending } from "@/src/utils/filters";
import { isMinor } from "@/src/utils/age";
import { useUserLocation } from "@/src/utils/useUserLocation";
import EventCard from "@/src/components/EventCard";
import SearchFilterBar from "@/src/components/SearchFilterBar";
import CategoryFilterRow from "@/src/components/CategoryFilterRow";
import RadiusFilter from "@/src/components/RadiusFilter";
import EventSheet from "@/src/components/EventSheet";

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
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [showRadius, setShowRadius] = useState(false);
  const { userLoc } = useUserLocation();

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
    });
    return trendingMode
      ? topTrending(base, 20)
      : base.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [events, query, category, trendingMode, quick, userLoc, radiusKm, user]);

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
        <Text style={[styles.title, { color: colors.onSurface }]}>{t("explore_title")}</Text>
        <SearchFilterBar query={query} onQuery={setQuery} quick={quick} onToggleQuick={toggleQuick} />
        <View style={{ marginHorizontal: -16, marginTop: 4 }}>
          <CategoryFilterRow selected={category} onSelect={setCategory} />
        </View>
        <View style={styles.radiusRow}>
          <Pressable
            testID="radius-toggle"
            onPress={() => setShowRadius((s) => !s)}
            style={[styles.radiusPill, { backgroundColor: showRadius || radiusKm !== null ? colors.brand : colors.surfaceTertiary, borderColor: showRadius || radiusKm !== null ? colors.brand : colors.border }]}
          >
            <Ionicons name="navigate" size={14} color={showRadius || radiusKm !== null ? colors.onBrand : colors.onSurface} />
            <Text style={[styles.radiusPillText, { color: showRadius || radiusKm !== null ? colors.onBrand : colors.onSurface }]}>
              {radiusKm === null ? t("radius") : `${radiusKm} ${t("km_unit")}`}
            </Text>
          </Pressable>
        </View>
        {showRadius && <RadiusFilter value={radiusKm} onChange={setRadiusKm} />}
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
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>{trendingMode ? t("trending_empty") : t("no_match")}</Text>}
          testID="explore-list"
        />
      )}

      <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints} enableDynamicSizing={false} enablePanDownToClose onClose={() => setSelected(null)}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }} backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}>
        {selected && <EventSheet event={selected} checkedIn={checkedIn} onCheckin={onCheckin} bottomInset={0} userLoc={userLoc} />}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, gap: 10 },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  radiusRow: { flexDirection: "row" },
  radiusPill: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  radiusPillText: { fontSize: 13, fontWeight: "800" },
  trendsHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  trendsTitle: { fontSize: 17, fontWeight: "800" },
  trendsHint: { fontSize: 13 },
  empty: { textAlign: "center", marginTop: 50, fontSize: 15, fontStyle: "italic" },
});
