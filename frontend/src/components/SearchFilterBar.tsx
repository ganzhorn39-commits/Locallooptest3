import React from "react";
import { View, TextInput, ScrollView, Pressable, Text, StyleSheet, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { QUICK_FILTERS, QuickKey } from "@/src/utils/filters";
import { useI18n } from "@/src/i18n";

export default function SearchFilterBar({
  query,
  onQuery,
  quick,
  onToggleQuick,
  compact,
  accessory,
}: {
  query: string;
  onQuery: (v: string) => void;
  quick: QuickKey[];
  onToggleQuick: (k: QuickKey) => void;
  compact?: boolean;
  accessory?: React.ReactNode; // shown right of the search field (bell, filter button)
}) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.searchRow}>
      <View style={[styles.search, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
        <TextInput
          testID="search-input"
          value={query}
          onChangeText={onQuery}
          placeholder={t("search_placeholder")}
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.searchInput, { color: colors.onSurface }]}
          returnKeyType="search"
        />
        {!!query && (
          <Pressable testID="search-clear" onPress={() => onQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        )}
      </View>
      {accessory}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {QUICK_FILTERS.map((f) => {
          const active = quick.includes(f.key);
          return (
            <Pressable
              key={f.key}
              testID={`quick-${f.key}`}
              onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); onToggleQuick(f.key); }}
              style={[styles.pill, { backgroundColor: active ? colors.brand : colors.surfaceSecondary, borderColor: active ? colors.brand : colors.border }]}
            >
              <Ionicons name={f.icon as any} size={14} color={active ? "#FFFFFF" : colors.onSurface} />
              <Text style={[styles.pillText, { color: active ? "#FFFFFF" : colors.onSurface }]}>{t(`quick_${f.key}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15 },
  pillRow: { gap: 8, paddingRight: 8, alignItems: "center" },
  pill: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: "600" },
});
