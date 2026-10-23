import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/api/client";

// Shown before chatting to accounts that never accepted the community guidelines
// (new accounts accept them during registration).
export default function GuidelinesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { refresh } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const agree = async () => {
    setSaving(true);
    try {
      await api.updateProfile({ accept_terms: true });
      await refresh();
      onClose();
    } catch {} finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <View testID="guidelines-modal" style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          <View style={[styles.icon, { backgroundColor: colors.brandTertiary }]}>
            <Ionicons name="shield-checkmark" size={28} color={colors.brand} />
          </View>
          <Text style={[styles.title, { color: colors.onSurface }]}>{t("guidelines_title")}</Text>
          <Text style={[styles.body, { color: colors.onSurfaceSecondary }]}>{t("guidelines_full")}</Text>
          <Pressable testID="guidelines-read" onPress={() => { onClose(); router.push("/legal/nutzungsbedingungen"); }} hitSlop={6}>
            <Text style={[styles.link, { color: colors.brand }]}>{t("guidelines_read")}</Text>
          </Pressable>
          <Pressable testID="guidelines-agree" onPress={agree} disabled={saving} style={[styles.btn, { backgroundColor: colors.brand, opacity: saving ? 0.6 : 1 }]}>
            {saving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={[styles.btnText, { color: colors.onBrand }]}>{t("agree")}</Text>}
          </Pressable>
          <Pressable testID="guidelines-later" onPress={onClose} hitSlop={6} style={{ paddingVertical: 4 }}>
            <Text style={[styles.later, { color: colors.onSurfaceTertiary }]}>{t("wall_later")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 22, alignItems: "center", gap: 12 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, textAlign: "center" },
  link: { fontSize: 14, fontWeight: "700" },
  btn: { alignSelf: "stretch", height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  btnText: { fontSize: 16, fontWeight: "800" },
  later: { fontSize: 14, fontWeight: "600" },
});
