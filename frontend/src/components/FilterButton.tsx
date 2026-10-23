import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";

// Opens the filter sheet; the small badge shows how many filters (date, distance, host type) are set.
export default function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const active = count > 0;
  return (
    <Pressable
      testID="filter-button"
      accessibilityLabel={t("filters_title")}
      hitSlop={6}
      onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); onPress(); }}
      style={[styles.btn, { backgroundColor: active ? colors.brandTertiary : colors.surfaceSecondary, borderColor: active ? colors.brand : colors.border }]}
    >
      <Ionicons name="options-outline" size={22} color={active ? colors.brand : colors.onSurface} />
      {active && (
        <View testID="filter-badge" style={[styles.badge, { backgroundColor: colors.brand, borderColor: colors.surfaceSecondary }]}>
          <Text style={[styles.badgeText, { color: colors.onBrand }]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 10, fontWeight: "900" },
});
