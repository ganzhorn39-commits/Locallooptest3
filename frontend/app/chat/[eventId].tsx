import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, Platform, Keyboard } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/src/theme/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api/client";
import ActionSheet from "@/src/components/ActionSheet";
import ReportSheet from "@/src/components/ReportSheet";
import GuidelinesModal from "@/src/components/GuidelinesModal";

type Message = {
  id: string; user_id: string; user_name: string; user_picture?: string; text: string;
  system?: boolean; system_key?: string; created_at: string;
};

export default function Chat() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, promptLogin } = useAuth();
  const { t } = useI18n();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState(0);
  const [text, setText] = useState("");
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<Message | null>(null);
  const [reportMsg, setReportMsg] = useState<Message | null>(null);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const listRef = useRef<FlatList>(null);
  const needsGuidelines = !!user && !user.terms_accepted_at;

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await api.getMessages(eventId);
      setMessages(msgs);
    } catch {}
  }, [eventId]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.getEvent(eventId), api.participants(eventId)])
      .then(([ev, pt]) => { if (alive) { setTitle(ev.title); setParticipants(pt.count); } })
      .catch(() => {});
    const poll = () => api.getMessages(eventId).then((m) => { if (alive) setMessages(m); }).catch(() => {});
    poll();
    const timer = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [eventId]);

  // Accounts from before the registration checkboxes accept the guidelines here once.
  useEffect(() => {
    if (!needsGuidelines) return;
    const timer = setTimeout(() => setShowGuidelines(true), 400);
    return () => clearTimeout(timer);
  }, [needsGuidelines]);

  const send = async () => {
    if (!user) { promptLogin(); return; }
    if (needsGuidelines) { setShowGuidelines(true); return; }
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      const msg = await api.sendMessage(eventId, body);
      setMessages((prev) => [...prev, msg]);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setText(body);
    }
  };

  const openProfile = (m: Message) => router.push(`/user/${m.user_id}`);

  const block = async (m: Message) => {
    try {
      await api.toggleBlock(m.user_id);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
    loadMessages();
  };

  const renderItem = ({ item }: { item: Message }) => {
    if (item.system || item.user_id === "system") {
      return (
        <View style={styles.systemWrap} testID={`system-msg-${item.id}`}>
          <Text style={[styles.systemText, { color: colors.onSurfaceTertiary, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            {item.system_key ? t(`sys_${item.system_key}`) : item.text}
          </Text>
        </View>
      );
    }
    const mine = item.user_id === user?.user_id;
    const onLong = mine ? undefined : () => {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setMenuFor(item);
    };
    return (
      <View style={[styles.msgRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
        {!mine && (
          <Pressable testID={`msg-avatar-${item.id}`} onPress={() => openProfile(item)} style={[styles.avatar, { backgroundColor: colors.surfaceTertiary }]} hitSlop={4}>
            {item.user_picture ? <Image source={{ uri: item.user_picture }} style={StyleSheet.absoluteFill} contentFit="cover" />
              : <Text style={[styles.avatarText, { color: colors.onSurface }]}>{(item.user_name || "?").charAt(0).toUpperCase()}</Text>}
          </Pressable>
        )}
        <View style={{ maxWidth: "78%", alignItems: mine ? "flex-end" : "flex-start" }}>
          {!mine && (
            <Pressable onPress={() => openProfile(item)} hitSlop={4} testID={`msg-author-${item.id}`}>
              <Text style={[styles.msgAuthor, { color: colors.onSurfaceTertiary }]}>{item.user_name}</Text>
            </Pressable>
          )}
          <Pressable testID={`msg-${item.id}`} onLongPress={onLong} delayLongPress={350}
            style={[styles.bubble, { backgroundColor: mine ? colors.brand : colors.surfaceSecondary, borderColor: colors.border, borderWidth: mine ? 0 : 1 }]}>
            <Text style={[styles.msgText, { color: mine ? colors.onBrand : colors.onSurface }]}>{item.text}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="chat-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="chat-back" onPress={() => { Keyboard.dismiss(); router.back(); }} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Pressable testID="chat-header-title" onPress={() => router.push(`/participants/${eventId}`)} style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]} numberOfLines={1}>{title || t("chat_group")}</Text>
          <Text style={[styles.headerSub, { color: colors.onSurfaceTertiary }]}>{participants} {t("attending")}</Text>
        </Pressable>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView behavior="translate-with-padding" keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          testID="chat-messages"
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>{t("say_hi")}</Text>}
        />
        {needsGuidelines && (
          <Pressable testID="guidelines-banner" onPress={() => setShowGuidelines(true)} style={[styles.banner, { backgroundColor: colors.brandTertiary }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.onBrandTertiary} />
            <Text style={[styles.bannerText, { color: colors.onBrandTertiary }]}>{t("guidelines_required")}</Text>
          </Pressable>
        )}
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder={t("message_ph")}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.input, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]}
            onSubmitEditing={send}
            returnKeyType="send"
            maxLength={2000}
          />
          <Pressable testID="chat-send" onPress={send} style={[styles.sendBtn, { backgroundColor: colors.brand }]}>
            <Ionicons name="arrow-up" size={22} color={colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ActionSheet
        testID="message-menu"
        visible={!!menuFor}
        title={menuFor?.user_name}
        message={menuFor ? `„${menuFor.text.length > 90 ? menuFor.text.slice(0, 90) + "…" : menuFor.text}“` : undefined}
        onClose={() => setMenuFor(null)}
        actions={menuFor ? [
          { key: "profile", label: t("view_profile"), icon: "person-circle-outline", onPress: () => openProfile(menuFor) },
          { key: "report", label: t("report_message"), icon: "flag-outline", onPress: () => setReportMsg(menuFor) },
          { key: "block", label: t("block_user"), icon: "ban-outline", danger: true, onPress: () => setConfirmBlock(menuFor) },
        ] : []}
      />
      <ActionSheet
        testID="block-confirm"
        visible={!!confirmBlock}
        title={confirmBlock ? t("block_confirm_title").replace("{name}", confirmBlock.user_name) : undefined}
        message={t("block_confirm_body")}
        onClose={() => setConfirmBlock(null)}
        actions={confirmBlock ? [{ key: "block-confirm", label: t("block_user"), icon: "ban", danger: true, onPress: () => block(confirmBlock) }] : []}
      />
      {reportMsg && <ReportSheet target={{ type: "message", id: reportMsg.id }} onClose={() => setReportMsg(null)} />}
      <GuidelinesModal visible={showGuidelines} onClose={() => setShowGuidelines(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  headerSub: { fontSize: 12, marginTop: 1 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontStyle: "italic" },
  msgRow: { width: "100%", flexDirection: "row", alignItems: "flex-end", gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 2 },
  avatarText: { fontSize: 13, fontWeight: "800" },
  msgAuthor: { fontSize: 11, marginBottom: 3, marginLeft: 6, fontWeight: "600" },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  msgText: { fontSize: 15, lineHeight: 20 },
  systemWrap: { alignItems: "center", paddingHorizontal: 12 },
  systemText: { fontSize: 12, fontWeight: "600", textAlign: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  bannerText: { fontSize: 13, fontWeight: "600", flex: 1 },
  composer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, paddingHorizontal: 16, fontSize: 15 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
