import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { api, FollowUser } from "@/src/api/client";
import FollowButton from "@/src/components/FollowButton";

type Tab = "followers" | "following";

// Followers / following of a person or venue, two tabs.
export default function Follows() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "following" ? "following" : "followers");
  const [list, setList] = useState<FollowUser[] | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (tab === "followers" ? api.followers(params.id) : api.following(params.id))
      .then((l) => { if (alive) setList(l); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [tab, params.id]));

  const switchTab = (k: Tab) => { setList(null); setTab(k); };

  const render = ({ item }: { item: FollowUser }) => {
    const biz = item.account_type === "business";
    const name = (biz && item.business_name) || item.name || "?";
    return (
      <Pressable testID={`follow-row-${item.user_id}`} onPress={() => router.push(`/user/${item.user_id}`)}
        style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceTertiary }]}>
          {item.picture ? <Image source={{ uri: item.picture }} style={StyleSheet.absoluteFill} contentFit="cover" />
            : <Ionicons name={biz ? "storefront" : "person"} size={20} color={colors.onSurfaceTertiary} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>{name}</Text>
            {biz && item.verified && <Ionicons name="checkmark-circle" size={15} color="#F5C542" />}
            {item.identity_verified && <Ionicons name="shield-checkmark" size={14} color="#4DA3FF" />}
          </View>
          {biz && <Text style={[styles.sub, { color: colors.onSurfaceTertiary }]}>Business</Text>}
        </View>
        {!item.is_me && <FollowButton key={`${item.user_id}-${tab}`} small userId={item.user_id} following={item.is_following} />}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="follows-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="follows-back" onPress={() => router.back()} hitSlop={10} style={{ width: 28 }}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={[styles.tabs, { backgroundColor: colors.surfaceTertiary }]}>
          {(["followers", "following"] as Tab[]).map((k) => (
            <Pressable key={k} testID={`follows-tab-${k}`} onPress={() => switchTab(k)} style={[styles.tab, tab === k && { backgroundColor: colors.brand }]}>
              <Text style={[styles.tabText, { color: tab === k ? colors.onBrand : colors.onSurface }]}>{k === "followers" ? t("followers") : t("following_tab")}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ width: 28 }} />
      </View>
      {list === null ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} /> : (
        <FlatList data={list} keyExtractor={(u) => u.user_id} renderItem={render}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>{tab === "followers" ? t("no_followers") : t("no_following")}</Text>} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  tabs: { flexDirection: "row", borderRadius: 12, padding: 3 },
  tab: { paddingHorizontal: 16, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 14, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { fontSize: 15, fontWeight: "800", flexShrink: 1 },
  sub: { fontSize: 12, marginTop: 1 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14 },
});
