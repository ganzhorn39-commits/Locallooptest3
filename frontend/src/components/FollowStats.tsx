import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, ThemeColors } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";

function Stat({ n, label, onPress, testID, colors }: { n: number; label: string; onPress?: () => void; testID: string; colors: ThemeColors }) {
  return (
    <Pressable testID={testID} disabled={!onPress} onPress={onPress} style={styles.stat}>
      <Text style={[styles.n, { color: colors.onSurface }]}>{n}</Text>
      <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{label}</Text>
    </Pressable>
  );
}

// Follower / Folgt (/ Events) counts; tapping opens the lists.
export default function FollowStats({ userId, followers, following, events }: {
  userId: string; followers: number; following: number; events?: number;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const open = (tab: string) => () => router.push(`/follows/${userId}?tab=${tab}`);
  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
      <Stat testID="stat-followers" n={followers} label={t("followers")} onPress={open("followers")} colors={colors} />
      <View style={[styles.sep, { backgroundColor: colors.border }]} />
      <Stat testID="stat-following" n={following} label={t("following_tab")} onPress={open("following")} colors={colors} />
      {events !== undefined && (<>
        <View style={[styles.sep, { backgroundColor: colors.border }]} />
        <Stat testID="stat-events" n={events} label={t("events_count")} colors={colors} />
      </>)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", borderRadius: 16, borderWidth: 1, paddingVertical: 12, marginTop: 6 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  n: { fontSize: 20, fontWeight: "900" },
  label: { fontSize: 12, fontWeight: "700" },
  sep: { width: 1, height: 30 },
});
