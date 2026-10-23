import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform } from "react-native";
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from "react-native-maps";
import { useTheme } from "@/src/theme/theme";
import { categoryMeta } from "@/src/constants/categories";
import type { EventItem } from "@/src/api/client";
import { darkMapStyle } from "@/src/components/mapStyle";

type Props = {
  events: EventItem[];
  region: any;
  onSelect: (e: EventItem) => void;
  mapRef?: any;
  radiusKm?: number | null;
  userLoc?: { latitude: number; longitude: number } | null;
};

function Pin({ event, color, onPress }: { event: EventItem; color: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!event.is_hot) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.6, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [event.is_hot]);

  const meta = categoryMeta(event.category);
  return (
    <View style={styles.pinWrap}>
      {event.is_hot && (
        <Animated.View style={[styles.pulse, { backgroundColor: color, transform: [{ scale }], opacity: scale.interpolate({ inputRange: [1, 1.6], outputRange: [0.4, 0] }) }]} />
      )}
      <View style={[styles.pin, { backgroundColor: color, shadowColor: color }]}>
        <Text style={styles.emoji}>{event.emoji || meta.emoji}</Text>
      </View>
      <View style={[styles.pinTip, { borderTopColor: color }]} />
    </View>
  );
}

type Cluster = { key: string; latitude: number; longitude: number; items: EventItem[] };

function clusterEvents(events: EventItem[], region: any): Cluster[] {
  const cell = Math.max(region.latitudeDelta, region.longitudeDelta) / 7;
  if (cell <= 0) return events.map((e) => ({ key: e.id, latitude: e.latitude, longitude: e.longitude, items: [e] }));
  const map: Record<string, Cluster> = {};
  events.forEach((e) => {
    const gx = Math.round(e.longitude / cell);
    const gy = Math.round(e.latitude / cell);
    const key = `${gx}_${gy}`;
    if (!map[key]) map[key] = { key, latitude: 0, longitude: 0, items: [] };
    map[key].items.push(e);
  });
  return Object.values(map).map((c) => {
    const lat = c.items.reduce((s, e) => s + e.latitude, 0) / c.items.length;
    const lng = c.items.reduce((s, e) => s + e.longitude, 0) / c.items.length;
    return { ...c, latitude: lat, longitude: lng };
  });
}

export default function MapCanvas({ events, region, onSelect, mapRef, radiusKm, userLoc }: Props) {
  const { colors, isDark } = useTheme();
  const internalRef = useRef<MapView>(null);
  const ref = mapRef || internalRef;
  const [curRegion, setCurRegion] = useState(region);

  useEffect(() => { setCurRegion(region); }, [region]);

  const clusters = useMemo(() => clusterEvents(events, curRegion || region), [events, curRegion]);
  const circleCenter = userLoc || (region ? { latitude: region.latitude, longitude: region.longitude } : null);

  const zoomTo = (c: Cluster) => {
    const r = { latitude: c.latitude, longitude: c.longitude, latitudeDelta: (curRegion?.latitudeDelta || 0.09) / 2.5, longitudeDelta: (curRegion?.longitudeDelta || 0.09) / 2.5 };
    ref.current?.animateToRegion?.(r, 500);
  };

  return (
    <MapView
      ref={ref}
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      showsUserLocation
      showsMyLocationButton={false}
      customMapStyle={isDark ? darkMapStyle : []}
      onRegionChangeComplete={setCurRegion}
      // keeps the Apple/Google legal logos above the floating "Überrasch mich" button
      mapPadding={{ top: 0, right: 0, bottom: 72, left: 0 }}
      testID="map-view"
    >
      {radiusKm && circleCenter && (
        <Circle
          center={circleCenter}
          radius={radiusKm * 1000}
          strokeColor={colors.brand}
          strokeWidth={2}
          fillColor={colors.brand + "22"}
        />
      )}
      {clusters.map((c) => {
        if (c.items.length === 1) {
          const e = c.items[0];
          const meta = categoryMeta(e.category);
          return (
            <Marker key={e.id} coordinate={{ latitude: e.pin_latitude ?? e.latitude, longitude: e.pin_longitude ?? e.longitude }} onPress={() => onSelect(e)} tracksViewChanges={Platform.OS === "ios" ? false : undefined}>
              <Pin event={e} color={meta.color} onPress={() => onSelect(e)} />
            </Marker>
          );
        }
        return (
          <Marker key={c.key} coordinate={{ latitude: c.latitude, longitude: c.longitude }} onPress={() => zoomTo(c)} tracksViewChanges={false}>
            <View style={[styles.cluster, { backgroundColor: colors.brand, shadowColor: colors.brand }]}>
              <Text style={styles.clusterText}>{c.items.length}</Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pinWrap: { alignItems: "center", justifyContent: "center", width: 60, height: 60 },
  emoji: { fontSize: 17 },
  pulse: { position: "absolute", width: 34, height: 34, borderRadius: 17, top: 5 },
  pin: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFFFFF",
    shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  pinTip: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
  cluster: {
    minWidth: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
    borderWidth: 2, borderColor: "#FFFFFF", shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  clusterText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
});
