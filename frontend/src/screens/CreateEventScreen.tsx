import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ActivityIndicator, Keyboard, Modal, Switch } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Calendar } from "react-native-calendars";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/auth/AuthContext";
import { api, EventItem } from "@/src/api/client";
import { DEFAULT_REGION, CATEGORIES, CategoryKey } from "@/src/constants/categories";
import LocationPicker from "@/src/components/LocationPicker";
import CategoryWheel from "@/src/components/CategoryWheel";
import TimeWheel from "@/src/components/TimeWheel";
import { pickImage } from "@/src/utils/pickImage";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FREQS: { key: string; label: string }[] = [
  { key: "weekly", label: "Every week" },
  { key: "biweekly", label: "Every two weeks" },
  { key: "monthly", label: "Every month" },
];

const CATEGORY_IMAGES: Record<string, string> = {
  nightlife: "https://images.unsplash.com/photo-1630395822970-acd6a691d97e?crop=entropy&cs=srgb&fm=jpg&q=85",
  rooftop: "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?crop=entropy&cs=srgb&fm=jpg&q=85",
  food: "https://images.unsplash.com/photo-1551883738-19ffa3dc4c43?crop=entropy&cs=srgb&fm=jpg&q=85",
  sports: "https://images.unsplash.com/photo-1601564350184-9e93c13df688?crop=entropy&cs=srgb&fm=jpg&q=85",
  arts: "https://images.unsplash.com/photo-1569783721854-33a99b4c0bae?crop=entropy&cs=srgb&fm=jpg&q=85",
  networking: "https://images.unsplash.com/photo-1511578314322-379afb476865?crop=entropy&cs=srgb&fm=jpg&q=85",
  gaming: "https://images.unsplash.com/photo-1542751371-adc38448a05e?crop=entropy&cs=srgb&fm=jpg&q=85",
  outdoor: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?crop=entropy&cs=srgb&fm=jpg&q=85",
  workshops: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?crop=entropy&cs=srgb&fm=jpg&q=85",
  music: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?crop=entropy&cs=srgb&fm=jpg&q=85",
};

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

const localDateISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const asCategory = (v?: string): CategoryKey =>
  CATEGORIES.some((c) => c.key === v) ? (v as CategoryKey) : "nightlife";

// `initial` switches the form into edit mode: every field starts from the existing event.
// `inTabs`: rendered inside the tab navigator, which already keeps the screen above the home indicator.
export default function CreateEventScreen({ onDone, showClose, initial, inTabs }: { onDone: () => void; showClose?: boolean; initial?: EventItem; inTabs?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const editing = !!initial;
  const isBiz = user?.account_type === "business"; // only business accounts can attach a deal
  const start = initial ? new Date(initial.start_time) : null;
  const hasStart = !!start && !isNaN(start.getTime());
  // A category stock photo stays "no banner", so the picture follows a category change.
  const customBanner = initial && !Object.values(CATEGORY_IMAGES).includes(initial.image_url)
    ? (initial.banner_url || initial.image_url || "") : "";

  const todayISO = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState<CategoryKey>(initial ? asCategory(initial.category) : "nightlife");
  const [dateISO, setDateISO] = useState(hasStart ? localDateISO(start!) : todayISO);
  const [showCal, setShowCal] = useState(false);
  const [hour, setHour] = useState(hasStart ? start!.getHours() : 20);
  const [minute, setMinute] = useState(hasStart ? start!.getMinutes() : 0);
  const [description, setDescription] = useState(initial?.description || "");
  const [instagram, setInstagram] = useState(initial?.instagram || "");
  const [website, setWebsite] = useState(initial?.website || "");
  const [tickets, setTickets] = useState(initial?.tickets_url || "");
  const [reservation, setReservation] = useState(initial?.reservation_url || "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [address, setAddress] = useState(initial?.address || "");
  const [coord, setCoord] = useState(initial
    ? { latitude: initial.latitude, longitude: initial.longitude }
    : { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude });
  const [banner, setBanner] = useState(customBanner);
  const [isRecurring, setIsRecurring] = useState(!!initial?.is_recurring);
  const [freq, setFreq] = useState(initial?.recurrence_freq || "weekly");
  const [days, setDays] = useState<number[]>(initial?.recurrence_days || []);
  const [joinApproval, setJoinApproval] = useState<"auto" | "manual">(initial?.join_approval || "auto");
  const [ageRestricted, setAgeRestricted] = useState(!!initial?.age_restricted);
  const [hasOffer, setHasOffer] = useState(!!initial?.offer_title);
  const [offerTitle, setOfferTitle] = useState(initial?.offer_title || "");
  const [offerLimit, setOfferLimit] = useState(initial?.offer_limit ? String(initial.offer_limit) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pickBanner = async () => {
    const res = await pickImage(Platform.OS === "web" ? "library" : "library");
    if ("base64" in res) setBanner(res.base64);
  };

  const toggleDay = (i: number) => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));

  const submit = async () => {
    Keyboard.dismiss();
    if (!title.trim()) { setError(t("title_required")); return; }
    const cap = parseInt(capacity, 10) || 0;
    const going = initial?.spots_taken ?? initial?.checkins ?? 0;
    if (editing && cap > 0 && cap < going) { setError(t("edit_capacity_error").replace("{n}", String(going))); return; }
    const dealLimit = hasOffer ? parseInt(offerLimit, 10) || 0 : 0;
    const dealsGone = initial?.offer_claimed ?? 0;
    if (isBiz && hasOffer && !offerTitle.trim()) { setError(t("offer_required")); return; }
    if (isBiz && dealLimit > 0 && dealLimit < dealsGone) { setError(t("offer_limit_error").replace("{n}", String(dealsGone))); return; }
    setError(""); setSubmitting(true);
    try {
      const when = new Date(dateISO + "T00:00:00");
      when.setHours(hour, minute, 0, 0);
      const timeStr = `${((hour % 12) || 12)}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
      const recLabel = isRecurring && days.length
        ? `${FREQS.find((f) => f.key === freq)?.label} · ${days.map((d) => WEEKDAYS[d]).join(", ")} at ${timeStr}`
        : "";
      const payload = {
        title: title.trim(), category, start_time: when.toISOString(),
        description: description.trim(),
        image_url: banner || CATEGORY_IMAGES[category], banner_url: banner || CATEGORY_IMAGES[category],
        instagram: instagram.trim(), website: website.trim(), tickets_url: tickets.trim(),
        reservation_url: reservation.trim(), capacity: cap,
        latitude: coord.latitude, longitude: coord.longitude, address: address.trim(),
        is_recurring: isRecurring && days.length > 0, recurrence_freq: freq,
        recurrence_days: isRecurring ? days : [], recurrence_label: recLabel,
        join_approval: joinApproval, age_restricted: ageRestricted,
        // Non-business accounts never send deal fields (the backend would refuse them).
        ...(isBiz ? { offer_title: hasOffer ? offerTitle.trim() : "", offer_limit: dealLimit } : {}),
      };
      if (initial) {
        // Keep the stored timestamp when the date/time was not touched (avoids a false "time changed" notice).
        if (hasStart && Math.floor(when.getTime() / 60000) === Math.floor(start!.getTime() / 60000)) payload.start_time = initial.start_time;
        await api.updateEvent(initial.id, payload);
      } else {
        await api.createEvent(payload);
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!editing) { setTitle(""); setDescription(""); setInstagram(""); setWebsite(""); setTickets(""); setAddress(""); }
      onDone();
    } catch (e: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = String(e?.message || "");
      const full = msg.match(/check-ins \((\d+)\)/);
      const dealsTaken = msg.match(/claimed deals \((\d+)\)/);
      if (dealsTaken) setError(t("offer_limit_error").replace("{n}", dealsTaken[1]));
      else if (!editing) setError(t("create_failed"));
      else if (full) setError(t("edit_capacity_error").replace("{n}", full[1]));
      else if (msg.startsWith("409")) setError(t("edit_cancelled"));
      else setError(t("edit_failed"));
    } finally { setSubmitting(false); }
  };

  const inputStyle = [styles.input, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }];

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="create-event-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        {showClose ? (
          <Pressable testID="close-add-event" onPress={onDone} style={{ width: 26 }}>
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
        ) : <View style={{ width: 26 }} />}
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{editing ? t("edit_event") : t("host_event")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" bottomOffset={90}>
        <Field label={t("event_banner")} colors={colors}>
          <Pressable testID="pick-banner" onPress={pickBanner} style={[styles.banner, { borderColor: colors.border, backgroundColor: colors.surfaceTertiary }]}>
            {!!banner && <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />}
            <View style={[styles.bannerOverlay, banner ? { backgroundColor: "rgba(0,0,0,0.35)" } : null]}>
              <Ionicons name="image" size={22} color={banner ? "#FFFFFF" : colors.brand} />
              <Text style={[styles.bannerText, { color: banner ? "#FFFFFF" : colors.onSurface }]}>{banner ? t("change_banner") : t("upload_banner")}</Text>
            </View>
          </Pressable>
        </Field>

        <Field label={t("event_title")} colors={colors}>
          <TextInput testID="input-title" value={title} onChangeText={setTitle} placeholder={t("event_title")} placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
        </Field>

        <Field label={t("category")} colors={colors}>
          <CategoryWheel value={category} onChange={setCategory} />
        </Field>

        <Field label={t("date")} colors={colors}>
          <Pressable testID="open-calendar" onPress={() => setShowCal(true)} style={[styles.dateBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            <Ionicons name="calendar" size={18} color={colors.brand} />
            <Text style={[styles.dateText, { color: colors.onSurface }]}>{fmtDate(dateISO)}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.onSurfaceTertiary} style={{ marginLeft: "auto" }} />
          </Pressable>
        </Field>

        <Field label={t("time")} colors={colors}>
          <TimeWheel hour={hour} minute={minute} onChange={(h, m) => { setHour(h); setMinute(m); }} />
        </Field>

        <Field label={t("recurring_q")} colors={colors}>
          <View style={[styles.recurRow, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            <Text style={{ color: colors.onSurface, fontSize: 14, flex: 1, fontWeight: "600" }}>{t("repeat_this")}</Text>
            <Switch testID="recurring-toggle" value={isRecurring} onValueChange={setIsRecurring} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
          </View>
          {isRecurring && (
            <>
              <View style={[styles.catRow, { marginTop: 8 }]}>
                {FREQS.map((f) => {
                  const active = freq === f.key;
                  return (
                    <Pressable key={f.key} testID={`freq-${f.key}`} onPress={() => setFreq(f.key)}
                      style={[styles.catChip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}>
                      <Text style={[styles.catChipText, { color: active ? "#FFFFFF" : colors.onSurface }]}>{t(`freq_${f.key}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.dayRow}>
                {WEEKDAYS.map((d, i) => {
                  const active = days.includes(i);
                  return (
                    <Pressable key={i} testID={`day-${i}`} onPress={() => toggleDay(i)}
                      style={[styles.dayChip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}>
                      <Text style={[styles.dayText, { color: active ? "#FFFFFF" : colors.onSurface }]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </Field>

        <Field label={t("location")} colors={colors}>
          <LocationPicker coord={coord} onChange={setCoord} />
          <TextInput testID="input-address" value={address} onChangeText={setAddress} placeholder={t("venue_ph")} placeholderTextColor={colors.onSurfaceTertiary} style={[inputStyle, { marginTop: 8 }]} />
        </Field>

        <Field label={t("description")} colors={colors}>
          <TextInput testID="input-description" value={description} onChangeText={setDescription} placeholder={t("whats_happening")} placeholderTextColor={colors.onSurfaceTertiary} multiline style={[inputStyle, { height: 90, textAlignVertical: "top", paddingTop: 12 }]} />
        </Field>

        <Field label={t("ig_handle")} colors={colors}>
          <TextInput testID="input-instagram" value={instagram} onChangeText={setInstagram} placeholder="@yourvenue" autoCapitalize="none" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
        </Field>

        <Field label={t("website")} colors={colors}>
          <TextInput testID="input-website" value={website} onChangeText={setWebsite} placeholder="https://..." autoCapitalize="none" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
        </Field>

        <Field label={t("ticket_link")} colors={colors}>
          <TextInput testID="input-tickets" value={tickets} onChangeText={setTickets} placeholder="https://tickets..." autoCapitalize="none" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
        </Field>

        <Field label={t("reservation_link")} colors={colors}>
          <TextInput testID="input-reservation" value={reservation} onChangeText={setReservation} placeholder="https://reserve..." autoCapitalize="none" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
        </Field>

        <Field label={t("capacity_label")} colors={colors}>
          <TextInput testID="input-capacity" value={capacity} onChangeText={(v) => setCapacity(v.replace(/[^0-9]/g, ""))} placeholder="0 = unlimited" keyboardType="number-pad" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
        </Field>

        {isBiz && (
          <Field label={t("offer_section")} colors={colors}>
            <View style={[styles.recurRow, { backgroundColor: colors.surfaceTertiary, borderColor: hasOffer ? colors.accent : colors.border }]}>
              <Ionicons name="gift" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }}>{t("offer_toggle")}</Text>
                <Text style={[styles.hintText, { color: colors.onSurfaceTertiary, marginTop: 2 }]}>{t("offer_toggle_hint")}</Text>
              </View>
              <Switch testID="offer-toggle" value={hasOffer} onValueChange={setHasOffer} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
            </View>
            {hasOffer && (
              <>
                <Text style={[styles.subLabel, { color: colors.onSurfaceTertiary }]}>{t("offer_title_label")}</Text>
                <TextInput testID="input-offer-title" value={offerTitle} onChangeText={setOfferTitle} maxLength={80}
                  placeholder={t("offer_title_ph")} placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
                <Text style={[styles.subLabel, { color: colors.onSurfaceTertiary }]}>{t("offer_limit_label")}</Text>
                <TextInput testID="input-offer-limit" value={offerLimit} onChangeText={(v) => setOfferLimit(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad" placeholder={t("offer_limit_ph")} placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle} />
              </>
            )}
          </Field>
        )}

        <Field label={t("join_approval_label")} colors={colors}>
          <View style={styles.catRow}>
            {([
              { key: "auto", label: t("approval_auto") },
              { key: "manual", label: t("approval_manual") },
            ] as const).map((o) => {
              const active = joinApproval === o.key;
              return (
                <Pressable key={o.key} testID={`approval-${o.key}`} onPress={() => setJoinApproval(o.key)}
                  style={[styles.catChip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}>
                  <Ionicons name={o.key === "auto" ? "flash" : "shield-checkmark"} size={15} color={active ? "#FFFFFF" : colors.onSurface} />
                  <Text style={[styles.catChipText, { color: active ? "#FFFFFF" : colors.onSurface }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hintText, { color: colors.onSurfaceTertiary }]}>{joinApproval === "auto" ? t("approval_auto_desc") : t("approval_manual_desc")}</Text>
        </Field>

        <Field label={t("age_restrict_label")} colors={colors}>
          <View style={[styles.recurRow, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }}>{t("age_restrict_toggle")}</Text>
              <Text style={[styles.hintText, { color: colors.onSurfaceTertiary, marginTop: 2 }]}>{t("age_restrict_hint")}</Text>
            </View>
            <Switch testID="age-restrict-toggle" value={ageRestricted} onValueChange={setAgeRestricted} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
          </View>
        </Field>

        {editing && (
          <View testID="edit-notify-hint" style={[styles.recurRow, { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary }]}>
            <Ionicons name="notifications-outline" size={18} color={colors.onBrandTertiary} />
            <Text style={{ color: colors.onBrandTertiary, fontSize: 13, flex: 1, lineHeight: 18 }}>{t("edit_notify_hint")}</Text>
          </View>
        )}

        {!!error && <Text style={[styles.error, { color: colors.error }]} testID="form-error">{error}</Text>}
      </KeyboardAwareScrollView>

      <KeyboardStickyView>
        <View style={[styles.footer, { paddingBottom: (inTabs ? 0 : insets.bottom) + 12, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable testID="submit-event" onPress={submit} disabled={submitting} style={[styles.submit, { backgroundColor: colors.brand, opacity: submitting ? 0.7 : 1 }]}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{editing ? t("save_changes") : t("publish")}</Text>}
          </Pressable>
        </View>
      </KeyboardStickyView>

      <Modal visible={showCal} transparent animationType="fade" onRequestClose={() => setShowCal(false)}>
        <Pressable style={styles.calBg} onPress={() => setShowCal(false)} testID="calendar-backdrop">
          <Pressable style={[styles.calCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Calendar
              testID="date-calendar"
              minDate={todayISO}
              onDayPress={(d: any) => { setDateISO(d.dateString); setShowCal(false); }}
              markedDates={{ [dateISO]: { selected: true, selectedColor: colors.brand } }}
              theme={{
                calendarBackground: colors.surfaceSecondary,
                dayTextColor: colors.onSurface,
                monthTextColor: colors.onSurface,
                textDisabledColor: colors.onSurfaceTertiary,
                arrowColor: colors.brand,
                todayTextColor: colors.brand,
                selectedDayBackgroundColor: colors.brand,
                selectedDayTextColor: "#FFFFFF",
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Field({ label, colors, children }: any) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  form: { padding: 16, gap: 18, paddingBottom: 40 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 999, borderWidth: 1 },
  catChipText: { fontSize: 14, fontWeight: "600" },
  hintText: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  subLabel: { fontSize: 12, fontWeight: "700", marginTop: 10 },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 10, height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 },
  dateText: { fontSize: 15, fontWeight: "600" },
  banner: { height: 130, borderRadius: 12, borderWidth: 1, overflow: "hidden", justifyContent: "flex-end" },
  bannerOverlay: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: "100%" },
  bannerText: { fontSize: 15, fontWeight: "700" },
  recurRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  dayRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  dayChip: { width: 44, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 13, fontWeight: "700" },
  error: { fontSize: 14, fontWeight: "600" },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  submit: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  submitText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  calBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  calCard: { borderRadius: 16, overflow: "hidden", width: "100%", padding: 8 },
});
