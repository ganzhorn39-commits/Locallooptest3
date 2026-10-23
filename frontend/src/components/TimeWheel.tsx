import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, NativeSyntheticEvent, NativeScrollEvent, Platform } from "react-native";
import { useTheme } from "@/src/theme/theme";

const ITEM_H = 44;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

function WheelColumn({
  items,
  index,
  onIndexChange,
  width,
  testID,
}: {
  items: string[];
  index: number;
  onIndexChange: (i: number) => void;
  width: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);
  const settling = useRef(false);
  const didInit = useRef(false);
  const webReady = useRef(false);
  const webTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(index);

  // Same approach as DateWheel: a fixed column height (otherwise the column grows to its full
  // content height, cannot scroll and always shows the middle of the list) + a deferred initial scroll.
  const scrollToIndex = (i: number, animated: boolean) => {
    ref.current?.scrollTo({ y: i * ITEM_H, animated });
  };

  useEffect(() => {
    indexRef.current = index;
    if (didInit.current) scrollToIndex(index, false);
  }, [index]);

  useEffect(() => () => { if (webTimer.current) clearTimeout(webTimer.current); }, []);

  const settleAt = (y: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    if (Math.abs(y - i * ITEM_H) > 1) scrollToIndex(i, true);
    if (i !== indexRef.current) onIndexChange(i);
  };

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (settling.current) return;
    settling.current = true;
    setTimeout(() => { settling.current = false; }, 220);
    settleAt(e.nativeEvent.contentOffset.y);
  };

  // Browsers fire no drag/momentum-end events for mouse-wheel or trackpad scrolling,
  // so on web a short pause in scroll events counts as the end of the gesture.
  const onWebScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!webReady.current) return;
    const y = e.nativeEvent.contentOffset.y;
    if (webTimer.current) clearTimeout(webTimer.current);
    webTimer.current = setTimeout(() => settleAt(y), 150);
  };

  return (
    <ScrollView
      ref={ref}
      testID={testID}
      style={{ width, height: ITEM_H * VISIBLE }}
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
      onContentSizeChange={() => {
        if (!didInit.current) {
          didInit.current = true;
          requestAnimationFrame(() => scrollToIndex(index, false));
          setTimeout(() => scrollToIndex(index, false), 120);
          setTimeout(() => { webReady.current = true; }, 300);
        }
      }}
      onMomentumScrollEnd={onEnd}
      onScrollEndDrag={onEnd}
      onScroll={Platform.OS === "web" ? onWebScroll : undefined}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingVertical: PAD }}
    >
      {items.map((it, i) => (
        <View key={i} style={styles.item}>
          <Text
            style={[
              styles.itemText,
              { color: i === index ? colors.onSurface : colors.onSurfaceTertiary, fontWeight: i === index ? "800" : "500", fontSize: i === index ? 22 : 18 },
            ]}
          >
            {it}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

type Props = {
  hour: number; // 0-23
  minute: number;
  onChange: (hour: number, minute: number) => void;
};

export default function TimeWheel({ hour, minute, onChange }: Props) {
  const { colors } = useTheme();
  const hours12 = useMemo(() => Array.from({ length: 12 }, (_, i) => `${i + 1}`), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => `${i}`.padStart(2, "0")), []);
  const periods = ["AM", "PM"];

  const period = hour >= 12 ? 1 : 0;
  const hour12Index = ((hour % 12) === 0 ? 12 : hour % 12) - 1;

  const emit = (h12i: number, minI: number, perI: number) => {
    let h = h12i + 1; // 1-12
    if (perI === 1) h = h === 12 ? 12 : h + 12;
    else h = h === 12 ? 0 : h;
    onChange(h, minI);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]} testID="time-wheel">
      <View style={[styles.centerBand, { borderColor: colors.border }]} pointerEvents="none" />
      <View style={styles.columns}>
        <WheelColumn testID="wheel-hour" items={hours12} index={hour12Index} width={70} onIndexChange={(i) => emit(i, minute, period)} />
        <Text style={[styles.colon, { color: colors.onSurface }]}>:</Text>
        <WheelColumn testID="wheel-minute" items={minutes} index={minute} width={70} onIndexChange={(i) => emit(hour12Index, i, period)} />
        <WheelColumn testID="wheel-period" items={periods} index={period} width={70} onIndexChange={(i) => emit(hour12Index, minute, i)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: ITEM_H * VISIBLE, borderRadius: 12, borderWidth: 1, overflow: "hidden", justifyContent: "center" },
  centerBand: { position: "absolute", left: 12, right: 12, height: ITEM_H, top: PAD, borderTopWidth: 1, borderBottomWidth: 1 },
  columns: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  item: { height: ITEM_H, alignItems: "center", justifyContent: "center" },
  itemText: { fontVariant: ["tabular-nums"] },
  colon: { fontSize: 22, fontWeight: "800", marginTop: -2 },
});
