import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/src/theme/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";
import { api, EventItem } from "@/src/api/client";
import { categoryLabel, DEFAULT_REGION } from "@/src/constants/categories";
import { filterEvents, QuickKey, topTrending } from "@/src/utils/filters";
import { eventWindow } from "@/src/utils/eventTime";
import { isMinor } from "@/src/utils/age";
import { useNow } from "@/src/hooks/use-now";
import { useFilters } from "@/src/filters/FilterContext";
import MapCanvas from "@/src/components/MapCanvas";
import CategoryFilterRow from "@/src/components/CategoryFilterRow";
import SearchFilterBar from "@/src/components/SearchFilterBar";
import FilterButton from "@/src/components/FilterButton";
import FilterSheet from "@/src/components/FilterSheet";
import EventSheet from "@/src/components/EventSheet";
import NotificationBell from "@/src/components/NotificationBell";
import { useLocationPermission } from "@/src/location/LocationPermission";

type Coords = { latitude: number; longitude: number };

export default function MapHome() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { askForLocation } = useLocationPermission();
  const { date, radiusKm, host, activeCount, reset } = useFilters();
  const now = useNow();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<QuickKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [region, setRegion] = useState<any>(DEFAULT_REGION);
  const [userLoc, setUserLoc] = useState<Coords | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const sheetRef = useRef<BottomSheet>(null);
  const mapRef = useRef<any>(null);
  const snapPoints = useMemo(() => ["36%", "90%"], []);

  const load = useCallback(async () => {
    try {
      setEvents(await api.listEvents());
    } catch (e) {
      console.log("load events error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const base = filterEvents(events, {
      query, category: category === "trending" ? "all" : category, quick, userLoc, radiusKm,
      hideRestricted: isMinor(user?.birthdate), date, host, now, categoryLabel: (e) => categoryLabel(e, t),
    });
    return category === "trending" ? topTrending(base) : base;
  }, [events, query, category, quick, userLoc, radiusKm, user, date, host, now, t]);

  // The map is native only; the web preview shows a stylised canvas without a real position.
  const locate = useCallback(async (): Promise<Coords | null> => {
    if (Platform.OS === "web") return null;
    try {
      if (!(await askForLocation())) return null;
      const loc = await Location.getCurrentPositionAsync({});
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
      return null;
    }
  }, [askForLocation]);

  const showPosition = useCallback((c: Coords | null) => {
    if (!c) return;
    setUserLoc(c);
    const r = { ...c, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    setRegion(r);
    mapRef.current?.animateToRegion?.(r, 600);
  }, []);

  const recenter = useCallback(() => { locate().then(showPosition); }, [locate, showPosition]);

  useEffect(() => {
    let alive = true;
    locate().then((c) => { if (alive) showPosition(c); });
    return () => { alive = false; };
  }, [locate, showPosition]);

  const onSelectPin = useCallback(async (e: EventItem) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSelected(e);
    setCheckedIn(false);
    sheetRef.current?.snapToIndex(0);
    if (user) {
      try {
        const s = await api.checkinStatus(e.id);
        setCheckedIn(s.checked_in);
      } catch {}
    }
  }, [user]);

  const onCheckin = useCallback(async (visibility?: string, atVenue?: boolean) => {
    if (!selected) return;
    try {
      const res = await api.checkin(selected.id, { visibility, at_venue: atVenue });
      setCheckedIn(res.checked_in);
      setSelected(res);
      setEvents((prev) => prev.map((ev) => (ev.id === res.id ? res : ev)));
    } catch (e) {
      console.log("checkin error", e);
    }
  }, [selected]);

  const surpriseMe = useCallback(() => {
    if (!filtered.length) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const t0 = Date.now();
    const twoH = t0 + 2 * 3600 * 1000;
    let pool = filtered.filter((e) => {
      const w = eventWindow(e, t0);
      return w.end > t0 && w.start <= twoH; // running now or starting within 2 hours
    });
    if (!pool.length) pool = [...filtered];
    pool.sort((a, b) => b.live_count - a.live_count);
    const top = pool.slice(0, Math.min(5, pool.length));
    const pick = top[Math.floor(Math.random() * top.length)];
    const r = { latitude: pick.latitude, longitude: pick.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    setRegion(r);
    mapRef.current?.animateToRegion?.(r, 800);
    onSelectPin(pick);
  }, [filtered, onSelectPin]);

  const toggleQuick = (k: QuickKey) => setQuick((q) => (q.includes(k) ? q.filter((x) => x !== k) : [...q, k]));
  const anyFilter = activeCount > 0 || quick.length > 0 || !!query || category !== "all";
  const resetAll = () => { reset(); setQuick([]); setQuery(""); setCategory("all"); };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="map-home">
      <MapCanvas events={filtered} region={region} onSelect={onSelectPin} mapRef={mapRef} radiusKm={radiusKm} userLoc={userLoc} now={now} />

      <View style={[styles.headerWrap, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.searchWrap}>
          <SearchFilterBar
            query={query} onQuery={setQuery} quick={quick} onToggleQuick={toggleQuick}
            accessory={<><FilterButton count={activeCount} onPress={() => setShowFilters(true)} /><NotificationBell boxed /></>}
          />
        </View>

        <CategoryFilterRow selected={category} onSelect={setCategory} />
      </View>

      {Platform.OS !== "web" && (
        <Pressable
          testID="recenter-button"
          onPress={recenter}
          style={[styles.recenter, { bottom: 76, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        >
          <Ionicons name="locate" size={22} color={colors.brand} />
        </Pressable>
      )}

      <Pressable
        testID="surprise-me-button"
        onPress={surpriseMe}
        style={[styles.surprise, { bottom: 16, backgroundColor: colors.surfaceInverse }]}
      >
        <Text style={{ fontSize: 16 }}>🎲</Text>
        <Text style={[styles.surpriseText, { color: colors.onSurfaceInverse }]}>{t("surprise_me")}</Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      )}

      {!loading && filtered.length === 0 && (
        <View style={styles.loadingOverlay} pointerEvents="box-none" testID="map-empty">
          <View style={[styles.emptyCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={styles.emptyRow}>
              <Ionicons name={category === "trending" ? "flame-outline" : "search"} size={22} color={colors.onSurfaceTertiary} />
              <Text style={[styles.emptyText, { color: colors.onSurface }]}>{category === "trending" ? t("trending_empty") : t("map_empty")}</Text>
            </View>
            {anyFilter && (
              <Pressable testID="map-empty-reset" onPress={resetAll} style={[styles.emptyBtn, { borderColor: colors.brand }]}>
                <Ionicons name="refresh" size={16} color={colors.brand} />
                <Text style={[styles.emptyBtnText, { color: colors.brand }]}>{t("filters_reset_all")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={() => setSelected(null)}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
      >
        {selected && (
          <EventSheet event={selected} checkedIn={checkedIn} onCheckin={onCheckin} bottomInset={0} userLoc={userLoc} />
        )}
      </BottomSheet>

      <FilterSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        events={events}
        resultCount={filtered.length}
        hasLocation={!!userLoc}
        onRequestLocation={recenter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: { position: "absolute", left: 0, right: 0, gap: 8 },
  searchWrap: { paddingHorizontal: 16 },
  recenter: { position: "absolute", right: 16, width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  surprise: {
    position: "absolute", left: 16, flexDirection: "row", alignItems: "center", gap: 8,
    height: 48, paddingHorizontal: 18, borderRadius: 24,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  surpriseText: { fontSize: 15, fontWeight: "800" },
  loadingOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  emptyCard: { maxWidth: 330, marginHorizontal: 24, padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyText: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 12, borderWidth: 1.5 },
  emptyBtnText: { fontSize: 14, fontWeight: "800" },
});
