import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, Keyboard } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, ApiError, RedeemResult } from "@/src/api/client";
import { formatDealTime } from "@/src/utils/deals";

type Result = { ok: true; deal: RedeemResult } | { ok: false; message: string; offer?: string; guest?: string };

// Business side of deals: scan a guest's QR code (or type the code) to redeem it exactly once.
export default function ScanDeal() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const lastScan = useRef({ data: "", at: 0 });

  const redeem = async (raw: string) => {
    if (busy || result || !raw.trim()) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      const deal = await api.redeemDeal(raw);
      setResult({ ok: true, deal });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const err = e as ApiError;
      const d = err.detail && typeof err.detail === "object" ? err.detail : null;
      let message = t("dash_action_failed");
      if (err.status === 404) message = t("scan_err_unknown");
      else if (err.status === 403) message = t("scan_err_foreign");
      else if (d?.reason === "redeemed") message = t("scan_err_redeemed").replace("{time}", formatDealTime(d.redeemed_at, lang));
      else if (d?.reason === "cancelled") message = t("scan_err_cancelled");
      else if (d?.reason === "expired") message = t("scan_err_expired");
      setResult({ ok: false, message, offer: d?.offer_title, guest: d?.guest_name });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const onScanned = ({ data }: { data: string }) => {
    const now = Date.now();
    if (data === lastScan.current.data && now - lastScan.current.at < 4000) return; // same code still in view
    lastScan.current = { data, at: now };
    redeem(data);
  };

  const next = () => { setResult(null); setCode(""); };
  const isBiz = user?.account_type === "business";

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="scan-deal-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="scan-close" onPress={() => router.back()} hitSlop={8} style={{ width: 26 }}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t("scan_title")}</Text>
        <View style={{ width: 26 }} />
      </View>

      {!isBiz ? (
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={34} color={colors.onSurfaceTertiary} />
          <Text style={[styles.centerText, { color: colors.onSurfaceSecondary }]}>{t("scan_only_business")}</Text>
        </View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" bottomOffset={20}>
          {result ? (
            <View testID={result.ok ? "scan-success" : "scan-error"}
              style={[styles.result, { backgroundColor: colors.surfaceSecondary, borderColor: result.ok ? colors.success : colors.error }]}>
              <Ionicons name={result.ok ? "checkmark-circle" : "close-circle"} size={64} color={result.ok ? colors.success : colors.error} />
              <Text style={[styles.resultTitle, { color: colors.onSurface }]}>{result.ok ? t("scan_ok") : result.message}</Text>
              {(result.ok ? result.deal.offer_title : result.offer) ? (
                <Text testID="scan-offer" style={[styles.resultOffer, { color: result.ok ? colors.success : colors.onSurfaceSecondary }]}>
                  {result.ok ? result.deal.offer_title : result.offer}
                </Text>
              ) : null}
              {(result.ok ? result.deal.guest_name : result.guest) ? (
                <Text testID="scan-guest" style={[styles.resultSub, { color: colors.onSurfaceTertiary }]}>
                  {[result.ok ? result.deal.guest_name : result.guest, result.ok ? result.deal.event_title : ""].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              <Pressable testID="scan-next" onPress={next} style={[styles.primaryBtn, { backgroundColor: colors.brand }]}>
                <Ionicons name="scan" size={20} color={colors.onBrand} />
                <Text style={[styles.primaryText, { color: colors.onBrand }]}>{t("scan_next")}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.cameraBox, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
                {permission?.granted ? (
                  <>
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                      onBarcodeScanned={busy ? undefined : onScanned}
                    />
                    <View pointerEvents="none" style={[styles.frame, { borderColor: colors.accent }]} />
                    {busy && <ActivityIndicator style={StyleSheet.absoluteFill} size="large" color={colors.accent} />}
                  </>
                ) : (
                  <View style={styles.centeredBox}>
                    <Ionicons name="camera-outline" size={38} color={colors.onSurfaceTertiary} />
                    <Text style={[styles.centerText, { color: colors.onSurfaceSecondary }]}>{t("scan_camera_needed")}</Text>
                    <Pressable testID="scan-allow-camera" onPress={() => requestPermission()} style={[styles.smallBtn, { backgroundColor: colors.brand }]}>
                      <Text style={[styles.primaryText, { color: colors.onBrand, fontSize: 15 }]}>{t("grant_permission")}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              {permission?.granted && <Text style={[styles.hint, { color: colors.onSurfaceTertiary }]}>{t("scan_hint")}</Text>}

              <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{t("scan_manual")}</Text>
              <View style={styles.manualRow}>
                <TextInput testID="scan-code-input" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false}
                  placeholder={t("scan_code_ph")} placeholderTextColor={colors.onSurfaceTertiary} onSubmitEditing={() => redeem(code)}
                  style={[styles.input, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]} />
                <Pressable testID="scan-redeem" onPress={() => redeem(code)} disabled={busy || !code.trim()}
                  style={[styles.redeemBtn, { backgroundColor: colors.accent, opacity: busy || !code.trim() ? 0.5 : 1 }]}>
                  {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.primaryText, { color: colors.onAccent, fontSize: 15 }]}>{t("scan_redeem")}</Text>}
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  body: { padding: 16, gap: 14 },
  centered: { alignItems: "center", gap: 12, padding: 32, marginTop: 40 },
  centeredBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  centerText: { fontSize: 15, textAlign: "center", lineHeight: 21 },
  cameraBox: { height: 320, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  frame: { position: "absolute", top: "20%", left: "20%", right: "20%", bottom: "20%", borderWidth: 3, borderRadius: 18 },
  hint: { fontSize: 13, textAlign: "center" },
  label: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  manualRow: { flexDirection: "row", gap: 10 },
  input: { flex: 1, minWidth: 0, height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, letterSpacing: 1 },
  redeemBtn: { flexShrink: 0, height: 50, borderRadius: 12, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  smallBtn: { height: 44, borderRadius: 12, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  result: { alignItems: "center", gap: 10, padding: 24, borderRadius: 20, borderWidth: 2, marginTop: 8 },
  resultTitle: { fontSize: 20, fontWeight: "900", textAlign: "center" },
  resultOffer: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  resultSub: { fontSize: 14, textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, alignSelf: "stretch", marginTop: 10 },
  primaryText: { fontSize: 16, fontWeight: "800" },
});
