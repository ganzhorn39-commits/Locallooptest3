import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, Platform, Keyboard } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/src/theme/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api/client";

export default function Chat() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, promptLogin } = useAuth();
  const { t } = useI18n();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const [messages, setMessages] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState(0);
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await api.getMessages(eventId);
      setMessages(msgs);
    } catch {}
  }, [eventId]);

  useEffect(() => {
    (async () => {
      try {
        const [ev, pt] = await Promise.all([api.getEvent(eventId), api.participants(eventId)]);
        setTitle(ev.title);
        setParticipants(pt.count);
      } catch {}
    })();
    loadMessages();
    const t = setInterval(loadMessages, 4000);
    return () => clearInterval(t);
  }, [eventId, loadMessages]);

  const send = async () => {
    if (!user) { promptLogin(); return; }
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      const msg = await api.sendMessage(eventId, t);
      setMessages((prev) => [...prev, msg]);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const renderItem = ({ item }: { item: any }) => {
    const mine = item.user_id === user?.user_id;
    return (
      <View style={[styles.msgWrap, { alignItems: mine ? "flex-end" : "flex-start" }]}>
        {!mine && <Text style={[styles.msgAuthor, { color: colors.onSurfaceTertiary }]}>{item.user_name}</Text>}
        <View style={[styles.bubble, { backgroundColor: mine ? colors.brand : colors.surfaceSecondary, borderColor: colors.border, borderWidth: mine ? 0 : 1 }]}>
          <Text style={[styles.msgText, { color: mine ? "#FFFFFF" : colors.onSurface }]}>{item.text}</Text>
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

      <KeyboardAvoidingView
        behavior="translate-with-padding"
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
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
          />
          <Pressable testID="chat-send" onPress={send} style={[styles.sendBtn, { backgroundColor: colors.brand }]}>
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  msgWrap: { width: "100%" },
  msgAuthor: { fontSize: 11, marginBottom: 3, marginLeft: 6, fontWeight: "600" },
  bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  msgText: { fontSize: 15, lineHeight: 20 },
  composer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, paddingHorizontal: 16, fontSize: 15 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
