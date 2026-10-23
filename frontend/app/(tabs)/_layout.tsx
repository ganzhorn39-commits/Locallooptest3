import React from "react";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        // Solid, in-flow bar: screens end above it, so the map doesn't show through and
        // bottom buttons (e.g. "Event veröffentlichen") and the map's legal logos stay visible.
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 58 + (Platform.OS === "ios" ? 24 : 0),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tab_map"), tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} /> }} />
      <Tabs.Screen name="explore" options={{ title: t("tab_explore"), tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} /> }} />
      <Tabs.Screen name="create" options={{ title: t("tab_create"), tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size + 6} color={color} /> }} />
      <Tabs.Screen name="chats" options={{ title: t("tab_chats"), tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: t("tab_profile"), tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
    </Tabs>
  );
}
