import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Animated, Easing } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme/theme";
import { categoryMeta, DEFAULT_REGION } from "@/src/constants/categories";
import type { EventItem } from "@/src/api/client";
import { isLiveNow } from "@/src/utils/eventTime";

type Props = {
  events: EventItem[];
  region: any;
  onSelect: (e: EventItem) => void;
  mapRef?: any;
  radiusKm?: number | null;
  userLoc?: { latitude: number; longitude: number } | null;
  now?: number;
};

function Pulse({ color }: { color: string }) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.8, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: false }),
      Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <Animated.View pointerEvents="none" style={[styles.pulse, {
      backgroundColor: color, transform: [{ scale }], opacity: scale.interpolate({ inputRange: [1, 1.8], outputRange: [0.55, 0] }),
    }]} />
  );
}

// Web fallback "map": a stylized canvas with positioned pins so the full
// tap -> bottom sheet flow works in the web preview (react-native-maps is native-only).
export default function MapCanvas({ events, region, onSelect, radiusKm, now }: Props) {
  const { colors, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const r = region || DEFAULT_REGION;

  const pos = (lat: number, lng: number) => {
    const x = 0.5 + (lng - r.longitude) / r.longitudeDelta;
    const y = 0.5 - (lat - r.latitude) / r.latitudeDelta;
    return {
      left: Math.max(0.06, Math.min(0.94, x)) * width,
      top: Math.max(0.12, Math.min(0.82, y)) * height,
    };
  };

  // Approximate on-screen radius circle (deg per km ~ 1/111).
  const circleDiameter = radiusKm ? ((radiusKm / 111) / r.latitudeDelta) * height * 2 : 0;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "#0e1626" : "#dfe7ef" }]} testID="map-view">
      <Image
        source={{ uri: "https://images.unsplash.com/photo-1604079628040-94301bb21b91?crop=entropy&cs=srgb&fm=jpg&q=70&w=800" }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.35)" }]} />
      {!!radiusKm && circleDiameter > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: width / 2 - circleDiameter / 2,
            top: height * 0.47 - circleDiameter / 2,
            width: circleDiameter,
            height: circleDiameter,
            borderRadius: circleDiameter / 2,
            borderWidth: 2,
            borderColor: colors.brand,
            backgroundColor: colors.brand + "22",
          }}
        />
      )}
      {events.map((e) => {
        const meta = categoryMeta(e.category);
        const color = meta.color;
        const p = pos(e.pin_latitude ?? e.latitude, e.pin_longitude ?? e.longitude);
        const live = isLiveNow(e, now);
        return (
          <Pressable
            key={e.id}
            testID={`map-pin-${e.id}`}
            accessibilityLabel={[e.title, live ? "live" : "", e.host_is_business ? "business" : ""].filter(Boolean).join(" · ")}
            onPress={() => onSelect(e)}
            style={[styles.pinWrap, { left: p.left - 20, top: p.top - 24 }]}
          >
            {live && <Pulse color={color} />}
            <View style={[styles.pin, { backgroundColor: color, shadowColor: color, shadowRadius: 10, shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 } },
              e.host_is_business && { borderColor: colors.accent }]}>
              <Text style={styles.emoji}>{e.emoji || meta.emoji}</Text>
            </View>
            {e.host_is_business && (
              <View testID={`map-pin-biz-${e.id}`} style={[styles.bizBadge, { backgroundColor: colors.accent }]}>
                <Ionicons name="storefront" size={9} color="#FFFFFF" />
              </View>
            )}
            {live && <View testID={`map-pin-live-${e.id}`} style={styles.liveDot} />}
          </Pressable>
        );
      })}
      <LinearGradient
        colors={["transparent", isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.15)"]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: { position: "absolute", alignItems: "center", justifyContent: "center", width: 40, height: 48 },
  emoji: { fontSize: 17 },
  pulse: { position: "absolute", top: 7, left: 3, width: 34, height: 34, borderRadius: 17 },
  bizBadge: { position: "absolute", top: 2, right: -2, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  liveDot: { position: "absolute", bottom: 4, left: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30", borderWidth: 1.5, borderColor: "#FFFFFF" },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 160 },
});
