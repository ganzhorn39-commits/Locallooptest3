import type { EventItem } from "@/src/api/client";
import { isAgeRestricted } from "@/src/constants/categories";

export type QuickKey = "today" | "free" | "outdoor" | "near";

export const QUICK_FILTERS: { key: QuickKey; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "today" },
  { key: "free", label: "Free Entry", icon: "pricetag" },
  { key: "outdoor", label: "Outdoor", icon: "leaf" },
  { key: "near", label: "Near Me", icon: "navigate" },
];

function haversideKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function filterEvents(
  events: EventItem[],
  opts: { query?: string; category?: string; quick?: QuickKey[]; userLoc?: { latitude: number; longitude: number } | null; radiusKm?: number | null; hideRestricted?: boolean; dateStart?: string | null; dateEnd?: string | null }
): EventItem[] {
  const q = (opts.query || "").trim().toLowerCase();
  const quick = opts.quick || [];
  return events.filter((e) => {
    if (opts.hideRestricted && isAgeRestricted(e.category)) return false;
    if (opts.category && opts.category !== "all" && e.category !== opts.category) return false;
    if (opts.dateStart) {
      const day = new Date(e.start_time).toISOString().slice(0, 10);
      const end = opts.dateEnd || opts.dateStart;
      if (day < opts.dateStart || day > end) return false;
    }
    if (q) {
      const hay = `${e.title} ${e.category} ${e.address} ${e.description} ${e.venue_name || ""} ${e.host_name || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (quick.includes("today")) {
      const d = new Date(e.start_time);
      const now = new Date();
      if (d.toDateString() !== now.toDateString()) return false;
    }
    if (quick.includes("free") && e.tickets_url) return false;
    if (quick.includes("outdoor") && !(e.category === "outdoor" || e.category === "sports")) return false;
    if (quick.includes("near")) {
      if (!opts.userLoc) return false;
      const km = haversideKm(
        { lat: opts.userLoc.latitude, lng: opts.userLoc.longitude },
        { lat: e.latitude, lng: e.longitude }
      );
      if (km > 5) return false;
    }
    if (opts.radiusKm && opts.userLoc) {
      const km = haversideKm(
        { lat: opts.userLoc.latitude, lng: opts.userLoc.longitude },
        { lat: e.latitude, lng: e.longitude }
      );
      if (km > opts.radiusKm) return false;
    }
    return true;
  });
}

export function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Happening now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d ${hrs % 24}h`;
}

// "Gerade angesagt": real activity only (check-ins + saves, computed by the backend), busiest first.
export function topTrending(events: EventItem[], n = 10): EventItem[] {
  return events
    .filter((e) => (e.trend_score || 0) > 0)
    .sort((a, b) => (b.trend_score || 0) - (a.trend_score || 0)
      || new Date(a.next_occurrence || a.start_time).getTime() - new Date(b.next_occurrence || b.start_time).getTime())
    .slice(0, n);
}
