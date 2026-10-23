import React from "react";
import { Text, StyleSheet, Pressable, Modal, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";

export type SheetAction = { key: string; label: string; icon?: string; danger?: boolean; onPress: () => void };

// Small bottom sheet with a few options (long-press menus, "…" menus, confirmations).
export default function ActionSheet({ visible, title, message, actions, onClose, testID }: {
  visible: boolean; title?: string; message?: string; actions: SheetAction[]; onClose: () => void; testID?: string;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose} testID={testID ? `${testID}-backdrop` : undefined}>
        <Pressable testID={testID} style={[styles.card, { backgroundColor: colors.surfaceSecondary, paddingBottom: insets.bottom + 20 }]}>
          {!!title && <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={2}>{title}</Text>}
          {!!message && <Text style={[styles.message, { color: colors.onSurfaceTertiary }]}>{message}</Text>}
          {actions.map((a) => (
            // iOS can't present the next modal (e.g. the report form) while this one is still fading out.
            <Pressable key={a.key} testID={`action-${a.key}`} onPress={() => { onClose(); setTimeout(a.onPress, Platform.OS === "ios" ? 350 : 0); }}
              style={[styles.option, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
              {!!a.icon && <Ionicons name={a.icon as any} size={21} color={a.danger ? colors.error : colors.brand} />}
              <Text style={[styles.optionText, { color: a.danger ? colors.error : colors.onSurface }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable testID="action-cancel" onPress={onClose} style={styles.cancel} hitSlop={6}>
            <Text style={[styles.cancelText, { color: colors.onSurfaceTertiary }]}>{t("cancel")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  card: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 10 },
  title: { fontSize: 17, fontWeight: "800" },
  message: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  optionText: { fontSize: 15, fontWeight: "700" },
  cancel: { alignItems: "center", paddingVertical: 8, marginTop: 2 },
  cancelText: { fontSize: 15, fontWeight: "700" },
});
