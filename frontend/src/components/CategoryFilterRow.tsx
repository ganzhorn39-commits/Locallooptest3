import React from "react";
import { ScrollView, Pressable, Text, View, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useTheme } from "@/src/theme/theme";
import { CATEGORIES } from "@/src/constants/categories";
import { useI18n } from "@/src/i18n";

type Props = {
  selected: string;
  onSelect: (key: string) => void;
};

export default function CategoryFilterRow({ selected, onSelect }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const chips = [
    // "trending" is a pseudo category: the screens show the busiest events (real check-ins + saves).
    { key: "trending", label: t("trending_now"), icon: "flame", color: colors.error },
    { key: "all", label: t("cat_all"), icon: "sparkles", color: colors.brand },
    ...CATEGORIES.map((c) => ({ key: c.key, label: t(`cat_${c.key}`), icon: c.icon, color: c.color })),
  ];

  return (
    <View style={styles.wrap} testID="category-filter-row">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {chips.map((c) => {
          const active = selected === c.key;
          return (
            <Pressable
              key={c.key}
              testID={`filter-chip-${c.key}`}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                onSelect(c.key);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? c.color : colors.surfaceSecondary,
                  borderColor: active ? c.color : colors.border,
                },
              ]}
            >
              <Ionicons
                name={c.icon as any}
                size={15}
                color={active ? "#FFFFFF" : c.color}
              />
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#FFFFFF" : colors.onSurface },
                ]}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 56, justifyContent: "center" },
  content: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: {
    height: 36,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "600" },
});
