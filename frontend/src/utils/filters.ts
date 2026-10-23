import type { EventItem } from "@/src/api/client";
import { isAgeRestricted } from "@/src/constants/categories";
import { DateFilter, eventWindow, hasEnded, isLiveNow, matchesDate } from "@/src/utils/eventTime";

// Quick chips under the search field. Date ("Heute") and distance live in the filter sheet.
export type QuickKey = "live" | "free" | "deals" | "outdoor";

export const QUICK_FILTERS: { key: QuickKey; icon: string }[] = [
  { key: "live", icon: "radio-outline" },
  { key: "free", icon: "pricetag" },
  { key: "deals", icon: "gift-outline" },
  { key: "outdoor", icon: "leaf" },
];

export type HostFilter = "all" | "business";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const dealLeft = (e: EventItem) => !!e.offer_title && (!e.offer_limit || (e.offer_claimed || 0) < e.offer_limit);

export function filterEvents(
  events: EventItem[],
  opts: {
    query?: string; category?: string; quick?: QuickKey[];
    userLoc?: { latitude: number; longitude: number } | null; radiusKm?: number | null;
    hideRestricted?: boolean; date?: DateFilter; host?: HostFilter; now?: number;
    categoryLabel?: (e: EventItem) => string; // translated category name, so "Essen" finds food events
  }
): EventItem[] {
  const q = (opts.query || "").trim().toLowerCase();
  const quick = opts.quick || [];
  const now = opts.now ?? Date.now();
  return events.filter((e) => {
    if (e.status === "cancelled") return false;
    if (opts.hideRestricted && isAgeRestricted(e.category)) return false;
    if (opts.category && opts.category !== "all" && e.category !== opts.category) return false;
    if (opts.host === "business" && !e.host_is_business) return false;
    if (opts.date && !matchesDate(e, opts.date, now)) return false;
    if (q) {
      const hay = `${e.title} ${e.category} ${e.category_label || ""} ${opts.categoryLabel?.(e) || ""} ${e.address} ${e.description} ${e.venue_name || ""} ${e.host_name || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (quick.includes("live") && !isLiveNow(e, now)) return false;
    if (quick.includes("free") && e.tickets_url) return false;
    if (quick.includes("deals") && !dealLeft(e)) return false;
    if (quick.includes("outdoor") && !(e.category === "outdoor" || e.category === "sports")) return false;
    if (opts.radiusKm && opts.userLoc) {
      const km = haversineKm(
        { lat: opts.userLoc.latitude, lng: opts.userLoc.longitude },
        { lat: e.latitude, lng: e.longitude }
      );
      if (km > opts.radiusKm) return false;
    }
    return true;
  });
}

// Running events first, then the coming ones by start; events that just ended (still listed for 2 h) last.
export function sortByTime(events: EventItem[], now = Date.now()): EventItem[] {
  const rank = (e: EventItem) => (isLiveNow(e, now) ? 0 : hasEnded(e, now) ? 2 : 1);
  return [...events].sort((a, b) => rank(a) - rank(b) || eventWindow(a, now).start - eventWindow(b, now).start);
}

// "Gerade angesagt": real activity only (check-ins + saves, computed by the backend), busiest first.
export function topTrending(events: EventItem[], n = 10): EventItem[] {
  return events
    .filter((e) => (e.trend_score || 0) > 0)
    .sort((a, b) => (b.trend_score || 0) - (a.trend_score || 0)
      || new Date(a.next_occurrence || a.start_time).getTime() - new Date(b.next_occurrence || b.start_time).getTime())
    .slice(0, n);
}
