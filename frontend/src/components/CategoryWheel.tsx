import React, { useRef } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { CATEGORIES, CategoryKey } from "@/src/constants/categories";

const ITEM_W = 104;

export default function CategoryWheel({
  value,
  onChange,
}: {
  value: CategoryKey;
  onChange: (k: CategoryKey) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const listRef = useRef<FlatList>(null);
  // Start with a pre-selected category in view (e.g. when editing); the first three are visible anyway.
  const selectedIndex = CATEGORIES.findIndex((c) => c.key === value);
  const startIndex = selectedIndex > 2 ? selectedIndex - 1 : undefined;

  const select = (k: CategoryKey, index: number) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    onChange(k);
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  };

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={CATEGORIES}
      keyExtractor={(c) => c.key}
      showsHorizontalScrollIndicator={false}
      snapToInterval={ITEM_W + 10}
      decelerationRate="fast"
      contentContainerStyle={styles.row}
      getItemLayout={(_, index) => ({ length: ITEM_W + 10, offset: (ITEM_W + 10) * index, index })}
      initialScrollIndex={startIndex}
      renderItem={({ item, index }) => {
        const active = value === item.key;
        return (
          <Pressable
            testID={`category-chip-${item.key}`}
            onPress={() => select(item.key, index)}
            style={[
              styles.card,
              {
                backgroundColor: active ? item.color : colors.surfaceTertiary,
                borderColor: active ? item.color : colors.border,
                transform: [{ scale: active ? 1.04 : 1 }],
              },
            ]}
          >
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text
              numberOfLines={2}
              style={[styles.label, { color: active ? "#FFFFFF" : colors.onSurface }]}
            >
              {t(`cat_${item.key}`)}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  card: {
    width: ITEM_W,
    height: 96,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  emoji: { fontSize: 30 },
  label: { fontSize: 12, fontWeight: "700", textAlign: "center" },
});
