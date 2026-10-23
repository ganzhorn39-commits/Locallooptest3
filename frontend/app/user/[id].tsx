import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/api/client";
import { getAge } from "@/src/utils/age";
import { CATEGORIES } from "@/src/constants/categories";
import ActionSheet from "@/src/components/ActionSheet";
import ReportSheet from "@/src/components/ReportSheet";

const openLink = async (url: string) => {
  try { await WebBrowser.openBrowserAsync(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch {}
};

export default function PublicProfile() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, promptLogin } = useAuth();
  const [u, setU] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getUser(id);
        setU(data);
        setBlocked(!!data.blocked);
      } catch {} finally { setLoading(false); }
    })();
  }, [id]);

  const isMe = !!user && user.user_id === id;

  const toggleBlock = async () => {
    try {
      const res = await api.toggleBlock(id);
      setBlocked(res.blocked);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
  };

  const onReport = () => (user ? setReporting(true) : promptLogin());
  const onBlock = () => (!user ? promptLogin() : blocked ? toggleBlock() : setConfirmBlock(true));

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

        {blocked && (
          <View testID="user-blocked-note" style={[styles.blockedNote, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="ban" size={16} color={colors.error} />
            <Text style={[styles.blockedText, { color: colors.onSurfaceSecondary }]}>{t("blocked_note")}</Text>
          </View>
        )}

        {!isMe && (
          <View style={styles.actions}>
            <Pressable testID="report-user" onPress={onReport} style={[styles.actionBtn, { borderColor: colors.border }]}>
              <Ionicons name="flag-outline" size={18} color={colors.warning} />
              <Text style={[styles.actionText, { color: colors.onSurface }]}>{t("report")}</Text>
            </Pressable>
            <Pressable testID="block-user" onPress={onBlock} style={[styles.actionBtn, { borderColor: blocked ? colors.error : colors.border }]}>
              <Ionicons name={blocked ? "lock-open-outline" : "ban-outline"} size={18} color={colors.error} />
              <Text style={[styles.actionText, { color: colors.onSurface }]}>{blocked ? t("unblock_user") : t("block_user")}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ActionSheet
        testID="block-confirm"
        visible={confirmBlock}
        title={t("block_confirm_title").replace("{name}", name || t("guest"))}
        message={t("block_confirm_body")}
        onClose={() => setConfirmBlock(false)}
        actions={[{ key: "block-confirm", label: t("block_user"), icon: "ban", danger: true, onPress: toggleBlock }]}
      />
      {reporting && <ReportSheet target={{ type: "user", id, title: `${t("report_user")}: ${name || ""}` }} onClose={() => setReporting(false)} />}
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
  blockedNote: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  blockedText: { fontSize: 13, flexShrink: 1, lineHeight: 18 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, height: 46, borderRadius: 12, borderWidth: 1 },
  actionText: { fontSize: 14, fontWeight: "700" },
});
