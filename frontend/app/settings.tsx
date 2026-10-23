import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch, ScrollView, Modal } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api/client";
import { LEGAL_DOCS, legalText } from "@/src/legal/content";

type BlockedUser = { user_id: string; name?: string; picture?: string; account_type?: string; business_name?: string };

export default function Settings() {
  const { colors, theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const { logout, user, refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Push switches live on the account (the server decides whom to push), not only on this device.
  const [notifEvents, setNotifEvents] = useState(user?.push_events !== false);
  const [notifMessages, setNotifMessages] = useState(user?.push_messages !== false);
  const [locationOn, setLocationOn] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeDeals, setActiveDeals] = useState(0);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);

  useFocusEffect(useCallback(() => {
    let alive = true;
    api.myDeals().then((d) => { if (alive) setActiveDeals(d.filter((x) => x.status === "active").length); }).catch(() => {});
    api.myBlocks().then((b) => { if (alive) setBlocked(b); }).catch(() => {});
    return () => { alive = false; };
  }, []));

  const unblock = async (id: string) => {
    try {
      await api.toggleBlock(id);
      setBlocked((list) => list.filter((b) => b.user_id !== id));
    } catch {}
  };

  useEffect(() => {
    (async () => {
      setLocationOn((await storage.getItem<boolean>("ll_location", true)) ?? true);
    })();
  }, []);

  const setPref = (key: string, v: boolean, setter: (b: boolean) => void) => { setter(v); storage.setItem(key, v); };
  const setPush = (field: "push_events" | "push_messages", v: boolean, setter: (b: boolean) => void) => {
    setter(v);
    api.updateProfile({ [field]: v }).then(() => refresh()).catch(() => setter(!v));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="settings-back" onPress={() => router.back()} style={{ width: 26 }}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t("settings")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 20 }}>
        {/* Deals: claimed offers with their QR codes */}
        <Section title={t("deals")} colors={colors}>
          <Pressable testID="settings-deals" onPress={() => router.push("/deals")} style={[styles.linkRow, { borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="gift-outline" size={18} color={colors.accent} />
              <Text style={[styles.linkText, { color: colors.onSurface }]}>{t("my_deals")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {activeDeals > 0 && (
                <View testID="settings-deals-count" style={[styles.countBadge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.countText, { color: colors.onAccent }]}>{activeDeals}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </View>
          </Pressable>
        </Section>

        {/* Language */}
        <Section title={t("language")} colors={colors}>
          <View style={styles.langRow}>
            {(["de", "en"] as const).map((l) => {
              const active = lang === l;
              return (
                <Pressable key={l} testID={`lang-${l}`} onPress={() => setLang(l)}
                  style={[styles.langChip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}>
                  <Text style={[styles.langText, { color: active ? "#FFFFFF" : colors.onSurface }]}>{l === "de" ? t("german") : t("english")}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Notifications */}
        <Section title={t("notifications")} colors={colors}>
          <Row label={t("notif_events")} colors={colors}>
            <Switch testID="toggle-notif-events" value={notifEvents} onValueChange={(v) => setPush("push_events", v, setNotifEvents)} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
          </Row>
          <Row label={t("notif_messages")} colors={colors}>
            <Switch testID="toggle-notif-messages" value={notifMessages} onValueChange={(v) => setPush("push_messages", v, setNotifMessages)} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
          </Row>
        </Section>

        {/* Location */}
        <Section title={t("location_services")} colors={colors}>
          <Row label={t("gps_tracking")} colors={colors}>
            <Switch testID="toggle-location" value={locationOn} onValueChange={(v) => setPref("ll_location", v, setLocationOn)} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
          </Row>
        </Section>

        {/* Appearance */}
        <Section title={t("appearance")} colors={colors}>
          {([
            { key: "standard", label: t("theme_standard"), desc: t("theme_standard_desc"), swatch: ["#0A0B0D", "#159AB8"] },
            { key: "gold", label: t("theme_gold"), desc: t("theme_gold_desc"), swatch: ["#FFFFFF", "#C9A227"] },
            { key: "sunset", label: t("theme_sunset"), desc: t("theme_sunset_desc"), swatch: ["#FFF8F3", "#E8501F"] },
            { key: "mint", label: t("theme_mint"), desc: t("theme_mint_desc"), swatch: ["#0F1720", "#34D399"] },
          ] as const).map((o) => {
            const active = theme === o.key;
            return (
              <Pressable
                key={o.key}
                testID={`theme-${o.key}`}
                onPress={() => setTheme(o.key)}
                style={[styles.themeRow, { backgroundColor: colors.surfaceSecondary, borderColor: active ? colors.brand : colors.border, borderWidth: active ? 2 : 1 }]}
              >
                <View style={[styles.themeSwatch, { backgroundColor: o.swatch[0], borderColor: colors.borderStrong }]}>
                  <View style={[styles.themeSwatchDot, { backgroundColor: o.swatch[1] }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkText, { color: colors.onSurface }]}>{o.label}</Text>
                  <Text style={[styles.themeDesc, { color: colors.onSurfaceTertiary }]}>{o.desc}</Text>
                </View>
                <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={22} color={active ? colors.brand : colors.onSurfaceTertiary} />
              </Pressable>
            );
          })}
        </Section>

        {/* Verification */}
        <Section title={t("verify_identity")} colors={colors}>
          <Pressable testID="verify-profile-row" onPress={() => router.push("/verify")} style={[styles.linkRow, { borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark" size={18} color={(user as any)?.identity_verified ? colors.brand : colors.onSurfaceTertiary} />
              <Text style={[styles.linkText, { color: colors.onSurface }]}>{t("verify_profile")}</Text>
            </View>
            {(user as any)?.identity_verified ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="checkmark-circle" size={18} color="#4DA3FF" />
                <Text style={{ color: "#4DA3FF", fontWeight: "700", fontSize: 13 }}>{t("verify_done")}</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            )}
          </Pressable>
        </Section>

        {/* Privacy & safety */}
        <Section title={t("privacy_section")} colors={colors}>
          <Pressable testID="settings-blocked" onPress={() => setShowBlocked(true)} style={[styles.linkRow, { borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="ban-outline" size={18} color={colors.error} />
              <Text style={[styles.linkText, { color: colors.onSurface }]}>{t("blocked_users")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {blocked.length > 0 && <Text style={[styles.linkText, { color: colors.onSurfaceTertiary }]}>{blocked.length}</Text>}
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </View>
          </Pressable>
        </Section>

        {/* Legal: Impressum, Datenschutz, Nutzungsbedingungen */}
        <Section title={t("legal")} colors={colors}>
          {LEGAL_DOCS.map((doc) => (
            <Pressable key={doc} testID={`legal-${doc}-row`} onPress={() => router.push(`/legal/${doc}`)} style={[styles.linkRow, { borderColor: colors.border }]}>
              <Text style={[styles.linkText, { color: colors.onSurface }]}>{legalText(doc, lang).title}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          ))}
        </Section>

        <Pressable testID="logout-button" onPress={async () => { await logout(); router.replace("/login"); }} style={[styles.logout, { backgroundColor: colors.error }]}>
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </Pressable>

        <Pressable testID="delete-account-button" onPress={() => setShowDelete(true)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Text style={[styles.deleteText, { color: colors.error }]}>{t("delete_account")}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <Pressable style={styles.modalBg} onPress={() => setShowDelete(false)} testID="delete-backdrop">
          <Pressable style={[styles.confirmCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="warning" size={40} color={colors.error} />
            <Text style={[styles.confirmTitle, { color: colors.onSurface }]}>{t("delete_account")}</Text>
            <Text style={[styles.confirmBody, { color: colors.onSurfaceTertiary }]}>{t("delete_confirm")}</Text>
            <Pressable testID="confirm-delete" disabled={deleting} onPress={async () => { setDeleting(true); try { await api.deleteAccount(); } catch {} await logout(); router.replace("/login"); }} style={[styles.confirmDelete, { backgroundColor: colors.error }]}>
              <Text style={styles.confirmDeleteText}>{t("delete_account")}</Text>
            </Pressable>
            <Pressable testID="cancel-delete" onPress={() => setShowDelete(false)} style={styles.confirmCancel}>
              <Text style={[styles.confirmCancelText, { color: colors.onSurfaceTertiary }]}>{t("cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showBlocked} transparent animationType="fade" onRequestClose={() => setShowBlocked(false)}>
        <Pressable style={styles.modalBg} onPress={() => setShowBlocked(false)}>
          <Pressable testID="blocked-list" style={[styles.modalCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>{t("blocked_users")}</Text>
            {blocked.length === 0 ? (
              <Text style={[styles.modalBody, { color: colors.onSurfaceTertiary }]}>{t("blocked_none")}</Text>
            ) : (
              blocked.map((b) => {
                const name = (b.account_type === "business" && b.business_name) || b.name || t("guest");
                return (
                  <View key={b.user_id} style={styles.blockedRow} testID={`blocked-${b.user_id}`}>
                    <View style={[styles.blockedAvatar, { backgroundColor: colors.surfaceTertiary }]}>
                      {b.picture ? <Image source={{ uri: b.picture }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        : <Text style={{ color: colors.onSurface, fontWeight: "800" }}>{name.charAt(0).toUpperCase()}</Text>}
                    </View>
                    <Text style={[styles.linkText, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>{name}</Text>
                    <Pressable testID={`unblock-${b.user_id}`} onPress={() => unblock(b.user_id)} style={[styles.unblockBtn, { borderColor: colors.border }]}>
                      <Text style={[styles.unblockText, { color: colors.onSurface }]}>{t("unblock_user")}</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
            <Pressable testID="blocked-close" onPress={() => setShowBlocked(false)} style={[styles.modalClose, { backgroundColor: colors.brand }]}>
              <Text style={styles.modalCloseText}>OK</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Section({ title, colors, children }: any) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.sectionTitle, { color: colors.onSurfaceTertiary }]}>{title}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}
function Row({ label, colors, children }: any) {
  return (
    <View style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.onSurface }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  sectionTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  langRow: { flexDirection: "row", gap: 10 },
  langChip: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  langText: { fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, height: 54, borderRadius: 12, borderWidth: 1 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, height: 52, borderRadius: 12, borderWidth: 1 },
  linkText: { fontSize: 15, fontWeight: "600" },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 12, fontWeight: "900" },
  themeRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  themeSwatch: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  themeSwatchDot: { width: 18, height: 18, borderRadius: 9 },
  themeDesc: { fontSize: 12, marginTop: 2 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 14, marginTop: 8 },
  logoutText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, paddingVertical: 10 },
  deleteText: { fontSize: 14, fontWeight: "700" },
  confirmCard: { width: "86%", alignSelf: "center", borderRadius: 20, padding: 24, alignItems: "center", gap: 10 },
  confirmTitle: { fontSize: 18, fontWeight: "800" },
  confirmBody: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  confirmDelete: { alignSelf: "stretch", height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  confirmDeleteText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  confirmCancel: { paddingVertical: 8 },
  confirmCancelText: { fontSize: 15, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 28 },
  modalCard: { borderRadius: 16, padding: 20, gap: 12, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalBody: { fontSize: 14, lineHeight: 21 },
  modalClose: { height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 4 },
  modalCloseText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  blockedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  blockedAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  unblockBtn: { paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  unblockText: { fontSize: 13, fontWeight: "700" },
});
