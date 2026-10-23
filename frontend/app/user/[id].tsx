import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api/client";
import { getAge } from "@/src/utils/age";
import { CATEGORIES } from "@/src/constants/categories";

const openLink = async (url: string) => {
  try { await WebBrowser.openBrowserAsync(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch {}
};

export default function PublicProfile() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [u, setU] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [reported, setReported] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    (async () => {
      try { setU(await api.getUser(id)); } catch {} finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <View style={[styles.container, { backgroundColor: colors.surface }]}><ActivityIndicator style={{ marginTop: 80 }} color={colors.brand} /></View>;

  const isBiz = u?.account_type === "business";
  const age = getAge(u?.birthdate);
  const name = isBiz ? (u?.business_name || u?.name) : u?.name;
  const bizCat = isBiz ? CATEGORIES.find((c) => c.key === u?.business_category) : undefined;
  const handle = ((isBiz && u?.business_instagram) || u?.instagram || "").replace(/^@/, "");

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="user-profile-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="user-back" onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
      </View>
      <View style={styles.body}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceTertiary, borderColor: colors.brand }]}>
          {u?.picture ? <Image source={{ uri: u.picture }} style={styles.avatarImg} contentFit="cover" /> : <Ionicons name="person" size={44} color={colors.onSurfaceTertiary} />}
        </View>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.onSurface }]}>{name}{!isBiz && age !== null ? `, ${age}` : ""}</Text>
          {isBiz && u?.verified && <Ionicons name="checkmark-circle" size={20} color="#F5C542" />}
          {u?.identity_verified && <Ionicons name="shield-checkmark" size={18} color="#4DA3FF" />}
        </View>
        {!!bizCat && (
          <View testID="user-business-category" style={[styles.catPill, { backgroundColor: bizCat.color }]}>
            <Text style={styles.catPillText}>{bizCat.emoji} {t(`cat_${bizCat.key}`)}</Text>
          </View>
        )}
        {!!u?.bio && <Text style={[styles.bio, { color: colors.onSurfaceSecondary }]}>{u.bio}</Text>}
        {isBiz && !!u?.business_address && (
          <View testID="user-business-address" style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={colors.onSurfaceTertiary} />
            <Text style={[styles.infoText, { color: colors.onSurfaceSecondary }]}>{u.business_address}</Text>
          </View>
        )}
        {isBiz && !!u?.business_website && (
          <Pressable testID="user-business-website" onPress={() => openLink(u.business_website)} style={styles.infoRow}>
            <Ionicons name="globe-outline" size={16} color={colors.brand} />
            <Text style={[styles.infoText, { color: colors.brand }]}>{u.business_website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}</Text>
          </Pressable>
        )}
        {!!handle && (
          <Pressable testID="user-instagram" onPress={() => openLink(`https://instagram.com/${handle}`)} style={styles.infoRow}>
            <Ionicons name="logo-instagram" size={16} color={colors.brand} />
            <Text style={[styles.ig, { color: colors.brand }]}>@{handle}</Text>
          </Pressable>
        )}

        <View style={styles.actions}>
          <Pressable testID="report-user" onPress={() => setReported(true)} style={[styles.actionBtn, { borderColor: colors.border }]}>
            <Ionicons name="flag-outline" size={18} color={colors.warning} />
            <Text style={[styles.actionText, { color: colors.onSurface }]}>{reported ? t("reported") : t("report")}</Text>
          </Pressable>
          <Pressable testID="block-user" onPress={() => setBlocked((b) => !b)} style={[styles.actionBtn, { borderColor: colors.border }]}>
            <Ionicons name="ban-outline" size={18} color={colors.error} />
            <Text style={[styles.actionText, { color: colors.onSurface }]}>{blocked ? t("blocked") : t("block")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  body: { alignItems: "center", padding: 24, gap: 10 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  name: { fontSize: 24, fontWeight: "900" },
  bio: { fontSize: 15, textAlign: "center", lineHeight: 21 },
  ig: { fontSize: 14, fontWeight: "700" },
  catPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  catPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoText: { fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, height: 46, borderRadius: 12, borderWidth: 1 },
  actionText: { fontSize: 14, fontWeight: "700" },
});
