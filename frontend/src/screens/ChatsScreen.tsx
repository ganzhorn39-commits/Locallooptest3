import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Swipeable } from "react-native-gesture-handler";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, EventItem } from "@/src/api/client";
import { categoryMeta } from "@/src/constants/categories";
import GuestGate from "@/src/components/GuestGate";

export default function ChatsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [attending, setAttending] = useState<EventItem[]>([]);
  const [crews, setCrews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const [att, cr] = await Promise.all([api.myAttending(), api.myCrews()]);
      setAttending(att);
      setCrews(cr);
    } catch {} finally { setLoading(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true); setError("");
    try {
      const crew = await api.createCrew(newName.trim());
      setNewName("");
      if (Platform.OS !== "web") Haptics.selectionAsync();
      router.push(`/crew/${crew.id}`);
    } catch { setError("Could not create crew"); } finally { setBusy(false); }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true); setError("");
    try {
      const crew = await api.joinCrew(joinCode.trim());
      setJoinCode("");
      router.push(`/crew/${crew.id}`);
    } catch { setError("Invalid invite code"); } finally { setBusy(false); }
  };

  const inputStyle = [styles.input, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }];

  const leaveEvent = async (id: string) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try { await api.checkin(id); } catch {}
    load();
  };
  const leaveCrewChat = async (id: string) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try { await api.leaveCrew(id); } catch {}
    load();
  };

  const RightAction = ({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) => (
    <Pressable testID={testID} onPress={onPress} style={[styles.swipeAction, { backgroundColor: colors.error }]}>
      <Ionicons name="trash" size={20} color="#FFFFFF" />
      <Text style={styles.swipeText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="chats-screen">
      {!user ? (
        <GuestGate icon="chatbubbles-outline" message={t("guest_chats")} />
      ) : (
      <>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>{t("chats_title")}</Text>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>{t("event_chats")}</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 10 }} />
        ) : attending.length === 0 ? (
          <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>{t("checkin_unlock")}</Text>
        ) : (
          attending.map((e) => {
            const meta = categoryMeta(e.category);
            return (
              <Swipeable key={e.id} overshootRight={false} renderRightActions={() => <RightAction testID={`leave-chat-${e.id}`} label={t("leave")} onPress={() => leaveEvent(e.id)} />}>
                <Pressable testID={`chat-item-${e.id}`} onPress={() => router.push(`/chat/${e.id}`)} style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={[styles.avatar, { backgroundColor: meta.color }]}>
                    <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.onSurface }]} numberOfLines={1}>{e.title}</Text>
                    <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]}>{e.live_count} {t("attending")} · {t("tap_to_chat")}</Text>
                  </View>
                  <Ionicons name="chatbubbles" size={20} color={colors.brand} />
                </Pressable>
              </Swipeable>
            );
          })
        )}

        <Text style={[styles.section, { color: colors.onSurfaceTertiary, marginTop: 8 }]}>{t("your_crews")}</Text>
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={styles.inline}>
            <TextInput testID="input-crew-name" value={newName} onChangeText={setNewName} placeholder={t("new_crew_ph")} placeholderTextColor={colors.onSurfaceTertiary} style={[inputStyle, { flex: 1 }]} />
            <Pressable testID="create-crew" onPress={create} disabled={busy} style={[styles.smallBtn, { backgroundColor: colors.brand }]}><Ionicons name="add" size={22} color="#FFFFFF" /></Pressable>
          </View>
          <View style={styles.inline}>
            <TextInput testID="input-join-code" value={joinCode} onChangeText={setJoinCode} placeholder={t("join_code_ph")} autoCapitalize="characters" placeholderTextColor={colors.onSurfaceTertiary} style={[inputStyle, { flex: 1 }]} />
            <Pressable testID="join-crew" onPress={join} disabled={busy} style={[styles.smallBtn, { backgroundColor: colors.surfaceInverse }]}><Ionicons name="enter" size={20} color={colors.onSurfaceInverse} /></Pressable>
          </View>
          {!!error && <Text style={{ color: colors.error, fontWeight: "600" }} testID="crews-error">{error}</Text>}
        </View>

        {crews.map((c) => (
          <Swipeable key={c.id} overshootRight={false} renderRightActions={() => <RightAction testID={`leave-crew-${c.id}`} label={t("leave")} onPress={() => leaveCrewChat(c.id)} />}>
            <Pressable testID={`crew-${c.id}`} onPress={() => router.push(`/crew/${c.id}`)} style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="people" size={20} color={colors.onBrandTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.onSurface }]}>{c.name}</Text>
                <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]}>{c.member_count} {c.member_count !== 1 ? t("member_other") : t("member_one")} · {c.invite_code}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          </Swipeable>
        ))}
      </KeyboardAwareScrollView>
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  section: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { fontSize: 14, fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 16, fontWeight: "700" },
  rowSub: { fontSize: 13, marginTop: 2 },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 10 },
  inline: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  smallBtn: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  swipeAction: { width: 88, marginBottom: 0, borderRadius: 16, alignItems: "center", justifyContent: "center", marginLeft: 8, gap: 3 },
  swipeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});
