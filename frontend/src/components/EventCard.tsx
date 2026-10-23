import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { categoryLabel, categoryMeta } from "@/src/constants/categories";
import { hasEnded, isLiveNow, recurrenceText, whenLabel } from "@/src/utils/eventTime";
import type { EventItem } from "@/src/api/client";

export default function EventCard({
  event,
  saved,
  onPress,
  onToggleSave,
}: {
  event: EventItem;
  saved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
}) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const meta = categoryMeta(event.category);
  const catColor = meta.color;
  const live = isLiveNow(event);
  const over = hasEnded(event);
  const timeColor = live ? colors.error : over ? colors.onSurfaceTertiary : colors.brand;
  const when = live || !event.is_recurring || !event.recurrence_days?.length ? whenLabel(event, t, lang) : recurrenceText(event, t, lang);

  return (
    <Pressable testID={`event-card-${event.id}`} onPress={onPress} style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <View style={styles.imageWrap}>
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: catColor }]} />
        )}
        <LinearGradient colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.7)"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.catBadge, { backgroundColor: catColor }]}>
          <Text style={{ fontSize: 12 }}>{event.emoji || meta.emoji}</Text>
          <Text style={styles.catBadgeText} numberOfLines={1}>{categoryLabel(event, t)}</Text>
        </View>
        <Pressable testID={`save-card-${event.id}`} onPress={onToggleSave} hitSlop={10} style={styles.saveBtn}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color="#FFFFFF" />
        </Pressable>
        {live ? (
          <View style={[styles.liveTag, { backgroundColor: "#FF3B30" }]} testID={`event-card-live-${event.id}`}>
            <View style={[styles.liveDot, { backgroundColor: "#FFFFFF" }]} />
            <Text style={styles.liveText}>{t("live_badge").toUpperCase()}</Text>
          </View>
        ) : (
          <View style={styles.liveTag}>
            <Ionicons name="people" size={13} color="#FFFFFF" />
            <Text style={styles.liveText}>{event.live_count}</Text>
          </View>
        )}
        {event.host_is_business && (
          <View style={[styles.bizTag, { backgroundColor: colors.accent }]}>
            <Ionicons name="storefront" size={11} color={colors.onAccent} />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>{event.title}</Text>
        {!!event.venue_name && (
          <View style={styles.venueRow}>
            {event.verified && <Ionicons name="checkmark-circle" size={14} color="#4DA3FF" />}
            <Text style={[styles.venue, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{event.venue_name}</Text>
            {!!event.rating && event.rating > 0 && (
              <View style={styles.cardRating}>
                <Ionicons name="star" size={12} color="#FFD60A" />
                <Text style={[styles.cardRatingText, { color: colors.onSurface }]}>{event.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        )}
        <View style={styles.metaRow}>
          <Ionicons name={live ? "radio-outline" : event.is_recurring ? "repeat" : "time-outline"} size={14} color={timeColor} />
          <Text style={[styles.countdown, { color: timeColor, flexShrink: 1 }]} numberOfLines={1}>{when}</Text>
          {!!event.capacity && event.capacity > 0 && (
            <Text style={[styles.spots, { color: (event.spots_taken || 0) >= event.capacity ? colors.error : colors.onSurfaceTertiary }]} numberOfLines={1}>
              · {(event.spots_taken || 0) >= event.capacity ? "Sold Out" : `${event.spots_taken || 0}/${event.capacity}`}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 14 },
  imageWrap: { height: 150 },
  catBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  catBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  saveBtn: { position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  liveTag: { position: "absolute", bottom: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FF3B30" },
  liveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  bizTag: { position: "absolute", bottom: 12, left: 12, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  info: { padding: 14, gap: 6 },
  title: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  venue: { fontSize: 13, fontWeight: "600" },
  venueRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardRating: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
  cardRatingText: { fontSize: 13, fontWeight: "800" },
  spots: { fontSize: 13, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  countdown: { fontSize: 13, fontWeight: "700" },
  dot: { fontSize: 13, marginHorizontal: 2 },
  addr: { fontSize: 13, flex: 1 },
});
