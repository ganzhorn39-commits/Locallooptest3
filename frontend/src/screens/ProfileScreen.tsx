import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";
import { api, Dashboard } from "@/src/api/client";
import { getAge } from "@/src/utils/age";
import { pickImage } from "@/src/utils/pickImage";
import CategoryWheel from "@/src/components/CategoryWheel";
import { CATEGORIES, CategoryKey } from "@/src/constants/categories";

const asCategory = (v?: string): CategoryKey =>
  CATEGORIES.some((c) => c.key === v) ? (v as CategoryKey) : "food";

export default function ProfileScreen({ showBack }: { showBack?: boolean }) {
  const { colors } = useTheme();
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isBiz = user?.account_type === "business";

  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState((user as any)?.bio || "");
  const [instagram, setInstagram] = useState((user as any)?.instagram || "");
  const [picture, setPicture] = useState(user?.picture || "");
  const [bizName, setBizName] = useState(user?.business_name || "");
  const [bizCat, setBizCat] = useState<CategoryKey>(asCategory(user?.business_category));
  const [bizAddress, setBizAddress] = useState(user?.business_address || "");
  const [bizWebsite, setBizWebsite] = useState(user?.business_website || "");
  const [bizInstagram, setBizInstagram] = useState(user?.business_instagram || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [hosting, setHosting] = useState<Dashboard["totals"] | null>(null);

  // Hosting summary for the dashboard entry (refreshed whenever the profile tab gains focus).
  useFocusEffect(useCallback(() => {
    let active = true;
    api.myDashboard().then((d) => { if (active) setHosting(d.totals); }).catch(() => {});
    return () => { active = false; };
  }, []));

  const inputStyle = [styles.input, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }];

  const changePhoto = async () => {
    const res = await pickImage("library");
    if ("base64" in res) setPicture(res.base64);
  };

  const save = async () => {
    setSaved(false); setError("");
    if (isBiz && !bizName.trim()) { setError(t("onb_biz_error")); return; }
    setSaving(true);
    try {
      await api.updateProfile(isBiz
        ? {
            name, bio, picture,
            business_name: bizName.trim(), business_category: bizCat, business_address: bizAddress.trim(),
            business_website: bizWebsite.trim(), business_instagram: bizInstagram.trim(),
          }
        : { name, bio, instagram, picture });
      await refresh();
      setSaved(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError(t("save_failed"));
    } finally { setSaving(false); }
  };

  const pending = hosting?.pending_requests || 0;
  const showDashboard = isBiz || (hosting?.events || 0) > 0;
  const count = (key: string, n: number) => t(`${key}_${n === 1 ? "one" : "other"}`).replace("{n}", String(n));

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="profile-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        {showBack ? (
          <Pressable testID="profile-back" onPress={() => router.back()} style={{ width: 26 }}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        ) : <View style={{ width: 26 }} />}
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t("my_profile")}</Text>
        <Pressable testID="open-settings" onPress={() => router.push("/settings")} style={{ width: 26 }}>
          <Ionicons name="settings-outline" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 90 }]} bottomOffset={20} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarWrap}>
          <Pressable testID="change-photo" onPress={changePhoto} style={[styles.avatar, { backgroundColor: colors.surfaceTertiary, borderColor: colors.brand }]}>
            {picture ? <Image source={{ uri: picture }} style={styles.avatarImg} contentFit="cover" /> : <Ionicons name="person" size={44} color={colors.onSurfaceTertiary} />}
            <View style={[styles.avatarEdit, { backgroundColor: colors.brand }]}><Ionicons name="camera" size={16} color="#FFFFFF" /></View>
          </Pressable>
          <Text style={[styles.email, { color: colors.onSurfaceTertiary }]}>{user?.email}</Text>
          {(() => {
            const age = getAge((user as any)?.birthdate);
            const isBiz = (user as any)?.account_type === "business";
            const verified = (user as any)?.verified;
            const idVerified = (user as any)?.identity_verified;
            const displayName = isBiz ? ((user as any)?.business_name || user?.name) : user?.name;
            return (
              <View style={styles.identityRow}>
                <Text style={[styles.identityName, { color: colors.onSurface }]}>
                  {displayName}{!isBiz && age !== null ? `, ${age}` : ""}
                </Text>
                {isBiz && verified && (
                  <View testID="verified-badge" style={styles.verifiedWrap}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                    <Text style={[styles.verifiedText, { color: colors.brand }]}>{t("verified")}</Text>
                  </View>
                )}
                {idVerified && (
                  <View testID="identity-badge" style={styles.verifiedWrap}>
                    <Ionicons name="shield-checkmark" size={16} color="#4DA3FF" />
                    <Text style={[styles.verifiedText, { color: "#4DA3FF" }]}>{t("verify_identity")}</Text>
                  </View>
                )}
              </View>
            );
          })()}
        </View>

        {showDashboard && (
          <Pressable testID="open-dashboard" onPress={() => router.push("/dashboard")}
            style={[styles.dashCard, { backgroundColor: colors.surfaceSecondary, borderColor: pending > 0 ? colors.accent : colors.border }]}>
            <View style={[styles.dashIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name={isBiz ? "stats-chart" : "calendar"} size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dashTitle, { color: colors.onSurface }]}>{isBiz ? t("dashboard_business") : t("dashboard_my_events")}</Text>
              {!!hosting && (
                <Text style={[styles.dashSub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                  {`${count("dash_active_count", hosting.active_events)} · ${count("dash_checkin_count", hosting.checkins)}`}
                </Text>
              )}
            </View>
            {pending > 0 && (
              <View testID="dashboard-pending-badge" style={[styles.dashBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.dashBadgeText, { color: colors.onAccent }]}>{pending}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        )}

        {isBiz && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("onb_business_profile")}</Text>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("biz_name")}</Text>
            <TextInput testID="input-biz-name" value={bizName} onChangeText={setBizName} placeholder={t("biz_name")} placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />

            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("biz_category")}</Text>
            <CategoryWheel value={bizCat} onChange={setBizCat} />

            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("biz_address")}</Text>
            <TextInput testID="input-biz-address" value={bizAddress} onChangeText={setBizAddress} placeholder={t("biz_address")} placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />

            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("biz_website")}</Text>
            <TextInput testID="input-biz-website" value={bizWebsite} onChangeText={setBizWebsite} placeholder="https://..." autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />

            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("biz_instagram")}</Text>
            <TextInput testID="input-biz-instagram" value={bizInstagram} onChangeText={setBizInstagram} placeholder="@yourvenue" autoCapitalize="none" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />

            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("description")}</Text>
            <TextInput testID="input-bio" value={bio} onChangeText={setBio} placeholder={t("description")} placeholderTextColor={colors.onSurfaceTertiary} multiline style={[inputStyle, { height: 90, textAlignVertical: "top", paddingTop: 12 }]} />

            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("personal_details")}</Text>
          </>
        )}

        <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("display_name")}</Text>
        <TextInput testID="input-name" value={name} onChangeText={setName} placeholder={t("display_name")} placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />

        {!isBiz && (
          <>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("bio")}</Text>
            <TextInput testID="input-bio" value={bio} onChangeText={setBio} placeholder={t("bio")} placeholderTextColor={colors.onSurfaceTertiary} multiline style={[inputStyle, { height: 90, textAlignVertical: "top", paddingTop: 12 }]} />

            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("instagram")}</Text>
            <TextInput testID="input-instagram" value={instagram} onChangeText={setInstagram} placeholder="@yourhandle" autoCapitalize="none" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
          </>
        )}

        {!!error && <Text testID="profile-error" style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

        <Pressable testID="save-profile" onPress={save} disabled={saving} style={[styles.save, { backgroundColor: colors.brand, opacity: saving ? 0.7 : 1 }]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{saved ? t("saved") : t("save_profile")}</Text>}
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  body: { padding: 16, gap: 10 },
  avatarWrap: { alignItems: "center", gap: 8, marginBottom: 8 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  avatarImg: { width: "100%", height: "100%", borderRadius: 55 },
  avatarEdit: { position: "absolute", bottom: 0, right: 0, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  email: { fontSize: 14 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  identityName: { fontSize: 20, fontWeight: "800" },
  verifiedWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  verifiedText: { fontSize: 12, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginTop: 14 },
  errorText: { fontSize: 14, fontWeight: "600" },
  dashCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, marginBottom: 4 },
  dashIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dashTitle: { fontSize: 16, fontWeight: "800" },
  dashSub: { fontSize: 13, marginTop: 2 },
  dashBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  dashBadgeText: { fontSize: 13, fontWeight: "900" },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  save: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 16 },
  saveText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  logoutText: { fontSize: 15, fontWeight: "700" },
});
