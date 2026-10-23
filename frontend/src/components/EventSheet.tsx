import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Modal, TextInput, Share } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { categoryMeta } from "@/src/constants/categories";
import { api, EventItem } from "@/src/api/client";
import DealCard from "@/src/components/DealCard";

import { countdown } from "@/src/utils/filters";

type Props = {
  event: EventItem;
  checkedIn: boolean;
  onCheckin: (visibility?: string, atVenue?: boolean) => void;
  bottomInset: number;
  userLoc?: { latitude: number; longitude: number } | null;
};

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const openLink = async (url: string) => {
  if (!url) return;
  try { await WebBrowser.openBrowserAsync(url); } catch {}
};

export default function EventSheet({ event, checkedIn, onCheckin, bottomInset, userLoc }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, promptLogin } = useAuth();
  const router = useRouter();
  const meta = categoryMeta(event.category);
  const catColor = meta.color;
  const [showRsvp, setShowRsvp] = useState(false);

  const atVenue = !!userLoc && distanceKm(userLoc, { latitude: event.latitude, longitude: event.longitude }) < 0.2;
  const capacity = event.capacity || 0;
  const taken = event.spots_taken || 0;
  const soldOut = capacity > 0 && taken >= capacity;

  const [participants, setParticipants] = useState(0);
  const [attendeeList, setAttendeeList] = useState<any[]>([]);
  const [saved, setSaved] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [myRating, setMyRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadSocial = useCallback(async () => {
    try {
      const pt = await api.participants(event.id);
      setParticipants(pt.count);
      setAttendeeList(pt.participants || []);
    } catch {}
    try {
      setSaved((await api.saveStatus(event.id)).saved);
    } catch {}
    try {
      setReviews(await api.getReviews(event.id));
    } catch {}
  }, [event.id]);

  const submitReview = async () => {
    if (!myRating) return;
    setSubmittingReview(true);
    try {
      await api.postReview(event.id, myRating, comment);
      setReviewMsg(t("review_thanks"));
      setComment("");
      setMyRating(0);
      await loadSocial();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {} finally { setSubmittingReview(false); }
  };

  const shareEvent = async () => {
    try {
      const url = event.website || event.tickets_url || "";
      await Share.share({ message: `${event.title} @ ${event.venue_name || event.address}\n${url}`.trim() });
    } catch {}
  };

  const toggleSave = async () => {
    if (!user) { promptLogin(); return; }
    setSaved((s) => !s);
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try { await api.toggleSave(event.id); } catch { loadSocial(); }
  };

  useEffect(() => { loadSocial(); }, [loadSocial, checkedIn]);

  const instaUrl = event.instagram ? `https://instagram.com/${event.instagram.replace(/^@/, "")}` : "";

  return (
    <BottomSheetScrollView contentContainerStyle={{ paddingBottom: bottomInset + 24 }} testID="event-sheet">
      <View style={styles.hero}>
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: catColor }]} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.heroContent}>
          <View style={styles.badgeRow}>
            <View style={[styles.catBadge, { backgroundColor: catColor }]}>
              <Text style={{ fontSize: 13 }}>{event.emoji || meta.emoji}</Text>
              <Text style={styles.catBadgeText}>{meta.label}</Text>
            </View>
            {event.is_recurring && !!event.recurrence_label && (
              <View style={styles.recurringBadge} testID="recurring-badge">
                <Ionicons name="repeat" size={12} color="#FFFFFF" />
                <Text style={styles.recurringText}>{event.recurrence_label}</Text>
              </View>
            )}
          </View>
          {!!event.venue_name && (
            <View style={styles.venueRow}>
              {event.verified && <Ionicons name="checkmark-circle" size={15} color="#4DA3FF" />}
              <Text style={styles.venueName}>{event.venue_name}</Text>
              {!!event.rating && event.rating > 0 && (
                <View style={styles.ratingPill} testID="venue-rating">
                  <Ionicons name="star" size={12} color="#FFD60A" />
                  <Text style={styles.ratingPillText}>{event.rating.toFixed(1)}</Text>
                  <Text style={styles.ratingPillCount}>({event.rating_count})</Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.heroTitle} testID="event-sheet-title">{event.title}</Text>
        </View>
        <Pressable testID="share-event-button" onPress={shareEvent} style={[styles.saveHero, { right: 62 }]}>
          <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
        </Pressable>
        <Pressable testID="save-event-button" onPress={toggleSave} style={styles.saveHero}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name={event.is_recurring ? "repeat" : "calendar-outline"} size={16} color={colors.onSurfaceTertiary} />
            <Text style={[styles.metaText, { color: colors.onSurface }]}>
              {event.is_recurring && event.recurrence_label ? event.recurrence_label : formatDate(event.next_occurrence || event.start_time)}
            </Text>
          </View>
          <View style={[styles.countdownChip, { backgroundColor: colors.brandTertiary, marginLeft: "auto" }]}>
            <Ionicons name="time" size={13} color={colors.onBrandTertiary} />
            <Text style={[styles.countdownText, { color: colors.onBrandTertiary }]} testID="event-countdown">{countdown(event.next_occurrence || event.start_time)}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={16} color={colors.onSurfaceTertiary} />
            <Text style={[styles.metaText, { color: colors.onSurface }]}>{event.address || "On the map"}</Text>
          </View>
        </View>

        <View style={[styles.liveCard, { backgroundColor: colors.brandTertiary }]}>
          <View style={styles.liveDot} />
          <Text style={[styles.liveCount, { color: colors.onBrandTertiary }]} testID="event-live-count">{event.live_count}</Text>
          <Text style={[styles.liveLabel, { color: colors.onBrandTertiary }]}>{t("heading_now")}</Text>
          {capacity > 0 && (
            <Text style={[styles.liveLabel, { color: soldOut ? colors.error : colors.onBrandTertiary, marginLeft: "auto", fontWeight: "800" }]} testID="capacity-counter">
              {soldOut ? t("sold_out") : `${taken}/${capacity}`}
            </Text>
          )}
        </View>

        <Pressable
          testID="checkin-button"
          onPress={() => {
            if (!user) { promptLogin(); return; }
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (checkedIn) { onCheckin(); return; }
            if (soldOut) return;
            setShowRsvp(true);
          }}
          disabled={soldOut && !checkedIn}
          style={[styles.checkinBtn, {
            backgroundColor: checkedIn ? colors.success : soldOut ? colors.surfaceTertiary : atVenue ? colors.accent : colors.surfaceTertiary,
            borderColor: checkedIn ? colors.success : atVenue ? colors.accent : colors.border,
            opacity: soldOut && !checkedIn ? 0.5 : 1,
          }]}
        >
          <Ionicons name={checkedIn ? "checkmark-circle" : atVenue ? "location" : "add-circle-outline"} size={20} color={checkedIn ? "#FFFFFF" : atVenue ? colors.onAccent : colors.onSurface} />
          <Text style={[styles.checkinText, { color: checkedIn ? "#FFFFFF" : atVenue ? colors.onAccent : colors.onSurface }]}>
            {checkedIn ? t("going") : soldOut ? t("sold_out") : atVenue ? `${t("at_venue")} · ${t("checkin_cta")}` : t("checkin_cta")}
          </Text>
        </Pressable>

        <DealCard key={event.id} event={event} checkedIn={checkedIn} />

        {!!user && user.user_id === event.created_by && (
          <Pressable testID="sheet-manage-event" onPress={() => router.push(`/event/${event.id}`)}
            style={[styles.chatBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            <Ionicons name="settings-outline" size={20} color={colors.brand} />
            <Text style={[styles.chatText, { color: colors.onSurface }]}>{t("dash_manage")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} style={{ marginLeft: "auto" }} />
          </Pressable>
        )}

        {/* Attendees */}
        {attendeeList.length > 0 && (
          <View testID="attendees-section">
            <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>{t("attendees")} · {participants}</Text>
            <View style={styles.attendeeRow}>
              {attendeeList.slice(0, 8).map((a) => (
                <View key={a.user_id} style={styles.attendee}>
                  <View style={[styles.attendeeAvatar, { backgroundColor: colors.surfaceTertiary, borderColor: a.anonymous ? colors.borderStrong : a.live ? colors.accent : catColor }]}>
                    {a.anonymous ? (
                      <Ionicons name="person" size={20} color={colors.onSurfaceTertiary} />
                    ) : a.picture ? (
                      <Image source={{ uri: a.picture }} style={styles.attendeeImg} contentFit="cover" />
                    ) : (
                      <Text style={[styles.attendeeInitial, { color: colors.onSurface }]}>{(a.name || "?").charAt(0).toUpperCase()}</Text>
                    )}
                    {!a.anonymous && a.live && <View style={[styles.liveBadge, { backgroundColor: colors.accent, borderColor: colors.surfaceSecondary }]} />}
                    {!a.anonymous && a.identity_verified && (
                      <View style={[styles.verBadge, { backgroundColor: "#4DA3FF", borderColor: colors.surfaceSecondary }]}>
                        <Ionicons name="checkmark" size={9} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.attendeeName, { color: a.anonymous ? colors.onSurfaceTertiary : a.live ? colors.accent : colors.onSurfaceSecondary }]} numberOfLines={1}>
                    {a.anonymous ? t("anon_attendee") : a.live ? t("live_badge") : (a.name || "Guest").split(" ")[0]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Group chat */}
        <Pressable
          testID="open-chat-button"
          onPress={() => {
            if (!user) { promptLogin(); return; }
            if (!checkedIn) return;
            router.push(`/chat/${event.id}`);
          }}
          style={[styles.chatBtn, { backgroundColor: checkedIn ? colors.surfaceTertiary : colors.surfaceTertiary, borderColor: colors.border, opacity: checkedIn ? 1 : 0.5 }]}
        >
          <Ionicons name="chatbubbles" size={20} color={catColor} />
          <Text style={[styles.chatText, { color: colors.onSurface }]}>
            {checkedIn ? t("open_chat") : t("unlock_chat")}
          </Text>
          {checkedIn && <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} style={{ marginLeft: "auto" }} />}
        </Pressable>

        {!!event.description && <Text style={[styles.desc, { color: colors.onSurfaceSecondary }]}>{event.description}</Text>}

        {/* Reviews */}
        <View style={{ gap: 10 }} testID="reviews-section">
          <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>{t("reviews_title")} · {reviews.length}</Text>
          {checkedIn ? (
            <View style={[styles.reviewCard, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
              <Text style={[styles.reviewPrompt, { color: colors.onSurface }]}>{t("rate_venue")}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Pressable key={s} testID={`star-${s}`} onPress={() => setMyRating(s)} hitSlop={6}>
                    <Ionicons name={s <= myRating ? "star" : "star-outline"} size={28} color="#FFD60A" />
                  </Pressable>
                ))}
              </View>
              <TextInput
                testID="review-comment"
                value={comment}
                onChangeText={setComment}
                placeholder={t("write_review")}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.reviewInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                multiline
              />
              {!!reviewMsg && <Text style={{ color: colors.success, fontWeight: "700", fontSize: 13 }} testID="review-msg">{reviewMsg}</Text>}
              <Pressable testID="submit-review" onPress={submitReview} disabled={!myRating || submittingReview} style={[styles.reviewSubmit, { backgroundColor: colors.brand, opacity: !myRating || submittingReview ? 0.5 : 1 }]}>
                <Text style={styles.reviewSubmitText}>{t("submit_review")}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.emptyStories, { color: colors.onSurfaceTertiary }]}>{t("review_need_checkin")}</Text>
          )}
          {reviews.length === 0 ? (
            <Text style={[styles.emptyStories, { color: colors.onSurfaceTertiary }]}>{t("no_reviews")}</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={[styles.reviewItem, { borderColor: colors.border }]} testID={`review-${r.id}`}>
                <View style={styles.reviewItemHead}>
                  <Text style={[styles.reviewAuthor, { color: colors.onSurface }]}>{r.user_name}</Text>
                  <View style={{ flexDirection: "row" }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons key={s} name={s <= r.rating ? "star" : "star-outline"} size={13} color="#FFD60A" />
                    ))}
                  </View>
                </View>
                {!!r.comment && <Text style={[styles.reviewComment, { color: colors.onSurfaceSecondary }]}>{r.comment}</Text>}
              </View>
            ))
          )}
        </View>

        <View style={styles.ctaGroup}>
          {!!event.tickets_url && (
            <Pressable testID="cta-tickets" onPress={() => openLink(event.tickets_url)} style={[styles.ctaPrimary, { backgroundColor: colors.brand }]}>
              <Ionicons name="ticket-outline" size={18} color="#FFFFFF" />
              <Text style={styles.ctaPrimaryText}>{t("buy_tickets")}</Text>
            </Pressable>
          )}
          {!!event.reservation_url && (
            <Pressable testID="cta-reservation" onPress={() => openLink(event.reservation_url!)} style={[styles.ctaPrimary, { backgroundColor: colors.accent }]}>
              <Ionicons name="restaurant-outline" size={18} color={colors.onAccent} />
              <Text style={[styles.ctaPrimaryText, { color: colors.onAccent }]}>{t("reserve")}</Text>
            </Pressable>
          )}
          <View style={styles.ctaRow}>
            {!!instaUrl && (
              <Pressable testID="cta-instagram" onPress={() => openLink(instaUrl)} style={[styles.ctaSecondary, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
                <Ionicons name="logo-instagram" size={18} color={colors.onSurface} />
                <Text style={[styles.ctaSecondaryText, { color: colors.onSurface }]}>Instagram</Text>
              </Pressable>
            )}
            {!!event.website && (
              <Pressable testID="cta-website" onPress={() => openLink(event.website)} style={[styles.ctaSecondary, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
                <Ionicons name="globe-outline" size={18} color={colors.onSurface} />
                <Text style={[styles.ctaSecondaryText, { color: colors.onSurface }]}>Website</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* RSVP privacy selector */}
      <Modal visible={showRsvp} transparent animationType="fade" onRequestClose={() => setShowRsvp(false)}>
        <Pressable style={styles.rsvpBg} onPress={() => setShowRsvp(false)} testID="rsvp-backdrop">
          <Pressable style={[styles.rsvpCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.rsvpTitle, { color: colors.onSurface }]}>{t("rsvp_title")}</Text>
            {([
              { key: "public", icon: "earth", label: t("rsvp_public"), desc: t("rsvp_public_desc") },
              { key: "friends", icon: "people", label: t("rsvp_friends"), desc: t("rsvp_friends_desc") },
              { key: "anonymous", icon: "eye-off", label: t("rsvp_anon"), desc: t("rsvp_anon_desc") },
            ] as const).map((o) => (
              <Pressable
                key={o.key}
                testID={`rsvp-${o.key}`}
                onPress={() => { setShowRsvp(false); onCheckin(o.key, atVenue); }}
                style={[styles.rsvpOption, { borderColor: colors.border, backgroundColor: colors.surfaceTertiary }]}
              >
                <Ionicons name={o.icon as any} size={22} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rsvpLabel, { color: colors.onSurface }]}>{o.label}</Text>
                  <Text style={[styles.rsvpDesc, { color: colors.onSurfaceTertiary }]}>{o.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { height: 220, justifyContent: "flex-end" },
  heroContent: { padding: 16, gap: 8 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  recurringBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  recurringText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  catBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  catBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  body: { padding: 16, gap: 14 },
  metaRow: { flexDirection: "row", alignItems: "center" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontSize: 14, fontWeight: "500" },
  countdownChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  countdownText: { fontSize: 13, fontWeight: "800" },
  saveHero: { position: "absolute", top: 14, right: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  liveCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderRadius: 12 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  liveCount: { fontSize: 22, fontWeight: "800" },
  liveLabel: { fontSize: 14, fontWeight: "600" },
  checkinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 12, borderWidth: 1 },
  checkinText: { fontSize: 15, fontWeight: "700" },
  venueName: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
  venueRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  ratingPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  ratingPillCount: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" },
  reviewCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  reviewPrompt: { fontSize: 15, fontWeight: "700" },
  starsRow: { flexDirection: "row", gap: 8 },
  reviewInput: { minHeight: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, fontSize: 14, textAlignVertical: "top" },
  reviewSubmit: { height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  reviewSubmitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  reviewItem: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  reviewItemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewAuthor: { fontSize: 14, fontWeight: "700" },
  reviewComment: { fontSize: 14, lineHeight: 20 },
  liveBadge: { position: "absolute", bottom: 0, right: 0, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  verBadge: { position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rsvpBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  rsvpCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34, gap: 12 },
  rsvpTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  rsvpOption: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  rsvpLabel: { fontSize: 15, fontWeight: "700" },
  rsvpDesc: { fontSize: 12, marginTop: 2 },
  attendeeRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  attendee: { alignItems: "center", width: 52, gap: 4 },
  attendeeAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  attendeeImg: { width: "100%", height: "100%" },
  attendeeInitial: { fontSize: 16, fontWeight: "800" },
  attendeeName: { fontSize: 11, textAlign: "center" },
  storiesHeader: { marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  storiesRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  storyAdd: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  storyThumb: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, overflow: "hidden" },
  storyImg: { width: "100%", height: "100%" },
  emptyStories: { fontSize: 13, fontStyle: "italic" },
  chatBtn: { flexDirection: "row", alignItems: "center", gap: 10, height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 },
  chatText: { fontSize: 15, fontWeight: "700" },
  desc: { fontSize: 15, lineHeight: 22 },
  ctaGroup: { gap: 10, marginTop: 4 },
  ctaPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 12 },
  ctaPrimaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  ctaRow: { flexDirection: "row", gap: 10 },
  ctaSecondary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 12, borderWidth: 1 },
  ctaSecondaryText: { fontSize: 15, fontWeight: "600" },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "100%", height: "80%" },
  viewerMeta: { position: "absolute", top: 60, left: 20 },
  viewerName: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  viewerClose: { position: "absolute", top: 56, right: 20 },
});
