import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Platform } from "react-native";
import * as Location from "expo-location";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";

type Ctx = { askForLocation: () => Promise<boolean> };
const LocationCtx = createContext<Ctx>({ askForLocation: async () => false });

/**
 * Explains why LocalLoop wants the location before the one-shot system dialog appears.
 * askForLocation() resolves true when permission is (or becomes) granted.
 */
export function LocationPermissionProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const pending = useRef<Promise<boolean> | null>(null);
  const resolver = useRef<((allow: boolean) => void) | null>(null);
  const notNow = useRef(false); // "Später" counts for the rest of the session

  const askForLocation = useCallback(async () => {
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.granted) return true;
      if (Platform.OS === "web") return (await Location.requestForegroundPermissionsAsync()).granted; // the browser explains itself
      if (!current.canAskAgain || notNow.current) return false;
      if (!pending.current) {
        pending.current = new Promise<boolean>((resolve) => { resolver.current = resolve; setVisible(true); });
      }
      const allow = await pending.current;
      pending.current = null;
      if (!allow) { notNow.current = true; return false; }
      return (await Location.requestForegroundPermissionsAsync()).granted;
    } catch {
      return false;
    }
  }, []);

  const answer = (allow: boolean) => {
    setVisible(false);
    resolver.current?.(allow);
    resolver.current = null;
  };

  return (
    <LocationCtx.Provider value={{ askForLocation }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => answer(false)}>
        <View style={styles.bg}>
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID="location-primer">
            <View style={[styles.icon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="navigate" size={30} color={colors.brand} />
            </View>
            <Text style={[styles.title, { color: colors.onSurface }]}>{t("loc_title")}</Text>
            <Text style={[styles.body, { color: colors.onSurfaceSecondary }]}>{t("loc_body")}</Text>
            <Pressable testID="location-primer-allow" onPress={() => answer(true)} style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={[styles.primaryText, { color: colors.onBrand }]}>{t("loc_allow")}</Text>
            </Pressable>
            <Pressable testID="location-primer-later" onPress={() => answer(false)} hitSlop={8} style={{ paddingVertical: 6 }}>
              <Text style={[styles.later, { color: colors.onSurfaceTertiary }]}>{t("loc_later")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </LocationCtx.Provider>
  );
}

export const useLocationPermission = () => useContext(LocationCtx);

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 28 },
  card: { width: "100%", maxWidth: 380, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: "center", gap: 12 },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 15, lineHeight: 21, textAlign: "center" },
  primary: { alignSelf: "stretch", height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 6 },
  primaryText: { fontSize: 16, fontWeight: "800" },
  later: { fontSize: 15, fontWeight: "700" },
});
