import React, { useState } from "react";
import { Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/api/client";

// "Folgen" / "Folge ich" toggle. Parents pass key={userId} so a new profile starts fresh.
export default function FollowButton({ userId, following, onChange, small, testID }: {
  userId: string; following: boolean; onChange?: (following: boolean, followers: number) => void; small?: boolean; testID?: string;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, promptLogin } = useAuth();
  const [on, setOn] = useState(following);
  const [busy, setBusy] = useState(false);
  const press = async () => {
    if (!user) { promptLogin(); return; }
    setBusy(true);
    try {
      const r = await api.toggleFollow(userId);
      setOn(r.following);
      onChange?.(r.following, r.followers_count);
      if (Platform.OS !== "web") Haptics.selectionAsync();
    } catch {} finally { setBusy(false); }
  };
  return (
    <Pressable testID={testID || `follow-${userId}`} onPress={press} disabled={busy}
      style={[small ? styles.small : styles.big, on
        ? { backgroundColor: "transparent", borderColor: colors.borderStrong }
        : { backgroundColor: colors.brand, borderColor: colors.brand }]}>
      {busy ? <ActivityIndicator size="small" color={on ? colors.onSurface : colors.onBrand} /> : (<>
        <Ionicons name={on ? "checkmark" : "person-add"} size={small ? 14 : 17} color={on ? colors.onSurface : colors.onBrand} />
        <Text style={[small ? styles.smallText : styles.bigText, { color: on ? colors.onSurface : colors.onBrand }]}>{on ? t("following_btn") : t("follow")}</Text>
      </>)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  big: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, minWidth: 150, paddingHorizontal: 22, borderRadius: 14, borderWidth: 1.5 },
  bigText: { fontSize: 15, fontWeight: "800" },
  small: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 34, minWidth: 100, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5 },
  smallText: { fontSize: 13, fontWeight: "800" },
});
