import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import Slider from "@react-native-community/slider";
import { BlurView } from "expo-blur";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";

const PRESETS: (number | null)[] = [1, 5, 15, null];

export default function RadiusFilter({
  value,
  onChange,
  plain,
}: {
  value: number | null; // km, null = all
  onChange: (km: number | null) => void;
  plain?: boolean; // inside the filter sheet: no glass card around it
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const Wrap: any = plain ? View : BlurView;
  const wrapProps = plain
    ? { style: [styles.wrap, { borderColor: colors.border, backgroundColor: colors.surfaceTertiary }] }
    : { intensity: Platform.OS === "android" ? 60 : 30, tint: "dark", style: [styles.wrap, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary + (Platform.OS === "web" ? "E6" : "99") }] };

  return (
    <Wrap {...wrapProps}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Ionicons name="navigate" size={15} color={colors.brand} />
          <Text style={[styles.label, { color: colors.onSurface }]}>{t("radius")}</Text>
        </View>
        <Text style={[styles.value, { color: colors.brand }]} testID="radius-value">
          {value === null ? t("radius_all") : `${value} ${t("km_unit")}`}
        </Text>
      </View>

      <Slider
        testID="radius-slider"
        style={{ width: "100%", height: 34 }}
        minimumValue={1}
        maximumValue={30}
        step={1}
        value={value ?? 30}
        minimumTrackTintColor={colors.brand}
        maximumTrackTintColor={colors.borderStrong}
        thumbTintColor={colors.brand}
        onValueChange={(v) => onChange(Math.round(v))}
      />

      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const active = value === p;
          return (
            <Pressable
              key={String(p)}
              testID={`radius-preset-${p ?? "all"}`}
              onPress={() => onChange(p)}
              style={[styles.preset, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}
            >
              <Text style={[styles.presetText, { color: active ? colors.onBrand : colors.onSurfaceSecondary }]}>
                {p === null ? t("radius_all") : `${p} ${t("km_unit")}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Wrap>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 14, fontWeight: "800" },
  presets: { flexDirection: "row", gap: 8, marginTop: 2 },
  preset: { flex: 1, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  presetText: { fontSize: 12, fontWeight: "700" },
});
