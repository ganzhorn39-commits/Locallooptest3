import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Swipeable } from "react-native-gesture-handler";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, ChatSummary } from "@/src/api/client";
import { categoryMeta } from "@/src/constants/categories";
import { timeAgo } from "@/src/utils/notifications";
import GuestGate from "@/src/components/GuestGate";
import ActionSheet, { SheetAction } from "@/src/components/ActionSheet";

type Confirm = { chat: ChatSummary; kind: "leave" | "remove" };

export default function ChatsScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [crews, setCrews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState<ChatSummary | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const [ch, cr] = await Promise.all([api.myChats(), api.myCrews()]);
      setChats(ch);
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

  // Active chats of guests can be left (= check-out); archived chats can be removed from the own list.
  const actionFor = (c: ChatSummary): Confirm["kind"] | null =>
    c.state !== "active" ? "remove" : c.role === "guest" ? "leave" : null;

  const run = async ({ chat, kind }: Confirm) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setChats((prev) => prev.filter((c) => c.event_id !== chat.event_id));
    try {
      if (kind === "leave") await api.checkin(chat.event_id); // toggles the check-in off
      else await api.hideChat(chat.event_id);
    } catch {}
    load();
  };
  const leaveCrewChat = async (id: string) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try { await api.leaveCrew(id); } catch {}
    load();
  };

  const RightAction = ({ label, onPress, testID, icon }: { label: string; onPress: () => void; testID: string; icon: string }) => (
    <Pressable testID={testID} onPress={onPress} style={[styles.swipeAction, { backgroundColor: colors.error }]}>
      <Ionicons name={icon as any} size={20} color="#FFFFFF" />
      <Text style={styles.swipeText}>{label}</Text>
    </Pressable>
  );

  const preview = (c: ChatSummary) => {
    const m = c.last_message;
    if (!m) return t("chat_no_messages");
    if (m.system) return m.system_key ? t(`sys_${m.system_key}`) : m.text;
    return `${m.user_id === user?.user_id ? t("chat_you") : m.user_name}: ${m.text}`;
  };

  const Tag = ({ text, color, filled, testID }: { text: string; color: string; filled?: boolean; testID?: string }) => (
    <View testID={testID} style={[styles.tag, { borderColor: color, backgroundColor: filled ? color : "transparent" }]}>
      <Text style={[styles.tagText, { color: filled ? "#FFFFFF" : color }]} numberOfLines={1}>{text}</Text>
    </View>
  );

  const renderChat = (c: ChatSummary) => {
    const meta = categoryMeta(c.category);
    const archived = c.state !== "active";
    const kind = actionFor(c);
    const row = (
      <Pressable
        testID={`chat-item-${c.event_id}`}
        onPress={() => router.push(`/chat/${c.event_id}`)}
        onLongPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); setMenuFor(c); }}
        delayLongPress={350}
        style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
      >
        <View style={[styles.avatar, { backgroundColor: meta.color, opacity: archived ? 0.45 : 1 }]}>
          <Text style={{ fontSize: 20 }}>{c.emoji || meta.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.rowTitle, { color: archived ? colors.onSurfaceSecondary : colors.onSurface }]} numberOfLines={1}>{c.title}</Text>
            {!!c.last_message && <Text style={[styles.time, { color: c.unread ? colors.brand : colors.onSurfaceTertiary }]}>{timeAgo(c.last_message.created_at, t, lang)}</Text>}
          </View>
          <Text style={[styles.rowSub, { color: c.unread ? colors.onSurface : colors.onSurfaceTertiary, fontWeight: c.unread ? "700" : "400" }]} numberOfLines={1}>
            {preview(c)}
          </Text>
          <View style={styles.tags}>
            {c.state === "ended" && <Tag testID={`chat-tag-ended-${c.event_id}`} text={t("chat_tag_ended")} color={colors.onSurfaceTertiary} />}
            {c.state === "cancelled" && <Tag testID={`chat-tag-cancelled-${c.event_id}`} text={t("chat_tag_cancelled")} color={colors.error} />}
            {c.is_live && !archived && <Tag text={`● ${t("live_now")}`} color="#FF3B30" filled />}
            {c.role === "host" && <Tag testID={`chat-tag-host-${c.event_id}`} text={t("chat_tag_host")} color={colors.brand} />}
            <Text style={[styles.members, { color: colors.onSurfaceTertiary }]}>{t("chat_members").replace("{n}", String(c.members))}</Text>
          </View>
        </View>
        {c.unread > 0 ? (
          <View testID={`chat-unread-${c.event_id}`} style={[styles.unread, { backgroundColor: colors.brand }]}>
            <Text style={[styles.unreadText, { color: colors.onBrand }]}>{c.unread > 99 ? "99+" : c.unread}</Text>
          </View>
        ) : (
          <Ionicons name={archived ? "archive-outline" : "chatbubbles"} size={20} color={archived ? colors.onSurfaceTertiary : colors.brand} />
        )}
      </Pressable>
    );
    if (!kind) return <View key={c.event_id}>{row}</View>;
    return (
      <Swipeable key={c.event_id} overshootRight={false} renderRightActions={() => (
        <RightAction testID={`${kind === "leave" ? "leave" : "remove"}-chat-${c.event_id}`} icon={kind === "leave" ? "exit-outline" : "trash"}
          label={kind === "leave" ? t("leave") : t("delete")} onPress={() => setConfirm({ chat: c, kind })} />
      )}>
        {row}
      </Swipeable>
    );
  };

  const active = chats.filter((c) => c.state === "active");
  const archived = chats.filter((c) => c.state !== "active");

  const menuActions: SheetAction[] = menuFor ? [
    { key: "open-chat", label: t("chat_open"), icon: "chatbubbles-outline", onPress: () => router.push(`/chat/${menuFor.event_id}`) },
    { key: "open-event", label: t("chat_open_event"), icon: "calendar-outline", onPress: () => router.push(`/event/${menuFor.event_id}`) },
    ...(actionFor(menuFor) === "leave" ? [{ key: "leave-chat", label: t("leave"), icon: "exit-outline", danger: true, onPress: () => setConfirm({ chat: menuFor, kind: "leave" }) }] : []),
    ...(actionFor(menuFor) === "remove" ? [{ key: "remove-chat", label: t("chat_remove"), icon: "trash-outline", danger: true, onPress: () => setConfirm({ chat: menuFor, kind: "remove" }) }] : []),
  ] : [];

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
        ) : active.length === 0 ? (
          <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>{t("checkin_unlock")}</Text>
        ) : (
          active.map(renderChat)
        )}

        {archived.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.onSurfaceTertiary, marginTop: 8 }]} testID="chats-archive">{t("chats_archive")}</Text>
            {archived.map(renderChat)}
          </>
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
          <Swipeable key={c.id} overshootRight={false} renderRightActions={() => <RightAction testID={`leave-crew-${c.id}`} icon="trash" label={t("leave")} onPress={() => leaveCrewChat(c.id)} />}>
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

      <ActionSheet testID="chat-menu" visible={!!menuFor} title={menuFor?.title} onClose={() => setMenuFor(null)} actions={menuActions} />
      <ActionSheet
        testID="chat-confirm"
        visible={!!confirm}
        title={confirm ? (confirm.kind === "leave" ? t("chat_leave_title").replace("{title}", confirm.chat.title) : t("chat_remove")) : undefined}
        message={confirm ? (confirm.kind === "leave" ? t("chat_leave_body") : t("chat_remove_body")) : undefined}
        onClose={() => setConfirm(null)}
        actions={confirm ? [{
          key: "confirm-chat", label: confirm.kind === "leave" ? t("leave") : t("chat_remove"),
          icon: confirm.kind === "leave" ? "exit-outline" : "trash", danger: true, onPress: () => run(confirm),
        }] : []}
      />
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: "700" },
  time: { fontSize: 12, fontWeight: "600" },
  rowSub: { fontSize: 13 },
  tags: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  tagText: { fontSize: 11, fontWeight: "800" },
  members: { fontSize: 12 },
  unread: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  unreadText: { fontSize: 12, fontWeight: "900" },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 10 },
  inline: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  smallBtn: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  swipeAction: { width: 88, marginBottom: 0, borderRadius: 16, alignItems: "center", justifyContent: "center", marginLeft: 8, gap: 3 },
  swipeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});
