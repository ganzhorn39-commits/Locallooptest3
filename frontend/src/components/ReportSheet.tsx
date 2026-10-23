import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ActivityIndicator, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { api, ReportReason, ReportTarget } from "@/src/api/client";

const REASONS: ReportReason[] = ["spam", "harassment", "hate", "sexual", "violence", "fake", "other"];

/**
 * "Melden" with a reason list. Mount it only while it is open (`{target && <ReportSheet … />}`),
 * so every report starts with a fresh form.
 */
export default function ReportSheet({ target, onClose }: {
  target: { type: ReportTarget; id: string; title?: string }; onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const heading = target.title || t(`report_${target.type}`);

  const send = async () => {
    if (!reason) return;
    setState("sending");
    try {
      await api.report(target.type, target.id, reason, note.trim());
      setState("done");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setState("error");
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose} testID="report-backdrop">
        <Pressable testID="report-sheet" style={[styles.card, { backgroundColor: colors.surfaceSecondary, paddingBottom: insets.bottom + 20 }]}>
          {state === "done" ? (
            <View style={styles.done} testID="report-done">
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              <Text style={[styles.title, { color: colors.onSurface, textAlign: "center" }]}>{t("report_done")}</Text>
              <Pressable testID="report-close" onPress={onClose} style={[styles.send, { backgroundColor: colors.brand, alignSelf: "stretch" }]}>
                <Text style={[styles.sendText, { color: colors.onBrand }]}>OK</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.head}>
                <Ionicons name="flag" size={20} color={colors.warning} />
                <Text style={[styles.title, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>{heading}</Text>
              </View>
              <Text style={[styles.sub, { color: colors.onSurfaceTertiary }]}>{t("report_why")}</Text>
              {REASONS.map((r) => {
                const active = reason === r;
                return (
                  <Pressable key={r} testID={`report-reason-${r}`} onPress={() => setReason(r)}
                    style={[styles.reason, { backgroundColor: colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}>
                    <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? colors.brand : colors.onSurfaceTertiary} />
                    <Text style={[styles.reasonText, { color: colors.onSurface }]}>{t(`reason_${r}`)}</Text>
                  </Pressable>
                );
              })}
              <TextInput testID="report-note" value={note} onChangeText={setNote} maxLength={500} multiline
                placeholder={t("report_note_ph")} placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.note, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]} />
              {state === "error" && <Text style={[styles.error, { color: colors.error }]}>{t("report_failed")}</Text>}
              <Pressable testID="report-send" onPress={send} disabled={!reason || state === "sending"}
                style={[styles.send, { backgroundColor: colors.brand, opacity: !reason || state === "sending" ? 0.5 : 1 }]}>
                {state === "sending" ? <ActivityIndicator color={colors.onBrand} /> : <Text style={[styles.sendText, { color: colors.onBrand }]}>{t("report_send")}</Text>}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  card: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 18, fontWeight: "800" },
  sub: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4, marginBottom: 2 },
  reason: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  reasonText: { fontSize: 15, fontWeight: "600", flex: 1 },
  note: { minHeight: 60, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, fontSize: 14, textAlignVertical: "top", marginTop: 4 },
  error: { fontSize: 13, fontWeight: "600" },
  send: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 6 },
  sendText: { fontSize: 16, fontWeight: "800" },
  done: { alignItems: "center", gap: 12, paddingVertical: 12 },
});
