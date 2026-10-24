import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useI18n } from "@/src/i18n";
import { useTheme } from "@/src/theme/theme";

export type AccountRole = "user" | "business";

// Two large cards: personal profile vs. business. `glass` = on the dark login background,
// otherwise themed (onboarding). testIDs: `${prefix}-personal` / `${prefix}-business`.
export default function AccountTypeCards({ onChoose, glass, prefix = "account" }: {
  onChoose: (role: AccountRole) => void; glass?: boolean; prefix?: string;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const cards: { role: AccountRole; id: string; icon: string; grad: [string, string]; title: string; desc: string; perks: string[] }[] = [
    { role: "user", id: "personal", icon: "person", grad: ["#22C1E8", "#1279B8"], title: t("acct_personal"), desc: t("acct_personal_desc"),
      perks: [t("acct_personal_p1"), t("acct_personal_p2"), t("acct_personal_p3")] },
    { role: "business", id: "business", icon: "storefront", grad: ["#34E5A8", "#0E9F6E"], title: t("acct_business"), desc: t("acct_business_desc"),
      perks: [t("acct_business_p1"), t("acct_business_p2"), t("acct_business_p3")] },
  ];
  const fg = glass ? "#FFFFFF" : colors.onSurface;
  const sub = glass ? "rgba(255,255,255,0.7)" : colors.onSurfaceSecondary;
  return (
    <View style={{ gap: 14 }}>
      {cards.map((c) => (
        <Pressable
          key={c.id}
          testID={`${prefix}-${c.id}`}
          onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); onChoose(c.role); }}
          style={({ pressed }) => [styles.card, {
            backgroundColor: glass ? "rgba(255,255,255,0.07)" : colors.surfaceSecondary,
            borderColor: glass ? "rgba(255,255,255,0.16)" : colors.border,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          }]}
        >
          <View style={styles.head}>
            <LinearGradient colors={c.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
              <Ionicons name={c.icon as any} size={30} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: fg }]}>{c.title}</Text>
              <Text style={[styles.desc, { color: sub }]}>{c.desc}</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={30} color={c.grad[0]} />
          </View>
          <View style={styles.perks}>
            {c.perks.map((p) => (
              <View key={p} style={styles.perk}>
                <Ionicons name="checkmark-circle" size={16} color={c.grad[0]} />
                <Text style={[styles.perkText, { color: sub }]}>{p}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 14 },
  icon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontWeight: "900", letterSpacing: -0.3 },
  desc: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  perks: { gap: 7, paddingLeft: 2 },
  perk: { flexDirection: "row", alignItems: "center", gap: 8 },
  perkText: { fontSize: 13, fontWeight: "600", flex: 1 },
});
