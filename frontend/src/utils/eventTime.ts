import type { EventItem } from "@/src/api/client";
import type { Lang } from "@/src/i18n";

// Same rules as the backend (backend/event_time.py): without an end time an event lasts 3 hours.
export const DEFAULT_DURATION_MS = 3 * 3600 * 1000;
export const HIDE_AFTER_END_MS = 2 * 3600 * 1000; // one-off events leave the map 2 hours after their end
const MAX_DURATION_MS = 7 * 86400 * 1000;

type Translate = (k: string) => string;
type Timed = Pick<EventItem, "start_time" | "end_time" | "next_occurrence" | "occurrences" | "is_recurring" | "status">;

const locale = (lang: Lang) => (lang === "de" ? "de-DE" : "en-US");
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));

export function durationMs(e: Pick<EventItem, "start_time" | "end_time">): number {
  const s = Date.parse(e.start_time);
  const en = e.end_time ? Date.parse(e.end_time) : NaN;
  if (!isNaN(s) && !isNaN(en) && en > s && en - s <= MAX_DURATION_MS) return en - s;
  return DEFAULT_DURATION_MS;
}

// Starts of the dates that matter: recurring events carry their coming dates, one-off events their start.
export function occurrenceStarts(e: Timed): number[] {
  const list = e.is_recurring && e.occurrences?.length ? e.occurrences : [e.next_occurrence || e.start_time];
  return list.map((x) => Date.parse(x)).filter((x) => !isNaN(x));
}

// Start/end of the running or the next date (checked on the device, so it stays right while the app is open).
export function eventWindow(e: Timed, now = Date.now()): { start: number; end: number } {
  const dur = durationMs(e);
  const starts = occurrenceStarts(e);
  for (const s of starts) if (s + dur > now) return { start: s, end: s + dur };
  const s = starts.length ? starts[starts.length - 1] : Date.parse(e.start_time);
  return { start: s, end: s + dur };
}

export const isLiveNow = (e: Timed, now = Date.now()) => {
  if (e.status === "cancelled") return false;
  const w = eventWindow(e, now);
  return w.start <= now && now < w.end;
};

export const hasEnded = (e: Timed, now = Date.now()) => !e.is_recurring && now >= eventWindow(e, now).end;

// Gone from map and lists (2 hours after the end); deals can't be claimed any more.
export const isPast = (e: Timed, now = Date.now()) =>
  e.status === "cancelled" || (!e.is_recurring && now >= eventWindow(e, now).end + HIDE_AFTER_END_MS);

// ---------- Date filter (filter sheet) ----------
export type DateFilter = { kind: "all" | "today" | "tomorrow" | "weekend" } | { kind: "date"; date: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const localISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseLocalDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// [from, to) in local time; null = no date restriction ("Alle kommenden").
export function dateRange(f: DateFilter, now = new Date()): [number, number] | null {
  const today = startOfDay(now);
  switch (f.kind) {
    case "today":
      return [today.getTime(), addDays(today, 1).getTime()];
    case "tomorrow":
      return [addDays(today, 1).getTime(), addDays(today, 2).getTime()];
    case "weekend": {
      const wd = today.getDay(); // 0 = Sunday, 6 = Saturday
      const sat = wd === 0 ? addDays(today, -1) : addDays(today, 6 - wd);
      return [Math.max(sat.getTime(), today.getTime()), addDays(sat, 2).getTime()];
    }
    case "date": {
      const day = parseLocalDate(f.date);
      return [day.getTime(), addDays(day, 1).getTime()];
    }
    default:
      return null;
  }
}

// An event matches a day when one of its dates starts that day, or when it is running right now (for today).
export function matchesDate(e: Timed, f: DateFilter, now = Date.now()): boolean {
  const range = dateRange(f, new Date(now));
  if (!range) return true;
  const [from, to] = range;
  const dur = durationMs(e);
  return occurrenceStarts(e).some((s) => (s >= from && s < to) || (s <= now && now < s + dur && from <= now && now < to));
}

// Local dates (YYYY-MM-DD) that have at least one event: dots in the filter calendar.
export function eventDays(events: Timed[], now = Date.now()): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    const dur = durationMs(e);
    for (const s of occurrenceStarts(e)) if (s + dur > now) out.add(localISODate(new Date(Math.max(s, now))));
  }
  return out;
}

// ---------- Texts ----------
export const formatTime = (ms: number, lang: Lang) =>
  new Date(ms).toLocaleTimeString(locale(lang), { hour: "numeric", minute: "2-digit" });
export const formatDay = (ms: number, lang: Lang) =>
  new Date(ms).toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short" });

const WEEKDAY_BASE = new Date(2026, 0, 5); // a Monday: index 0 = Monday like the backend
export const weekdayShort = (i: number, lang: Lang) =>
  addDays(WEEKDAY_BASE, i).toLocaleDateString(locale(lang), { weekday: "short" }).replace(/\.$/, "");

function timeRange(e: Timed & { end_time?: string }, start: number, lang: Lang): string {
  const t = formatTime(start, lang);
  if (!e.end_time) return t;
  const end = start + durationMs(e);
  const sameDayOrNight = end - start < 24 * 3600 * 1000;
  return sameDayOrNight ? `${t}–${formatTime(end, lang)}` : `${t} – ${formatDay(end, lang)} ${formatTime(end, lang)}`;
}

// "Jede Woche · Mo, Mi · 20:00" / "Every 2 weeks · Fri · 9:00 PM" / "Jeden 2. Fr im Monat · 19:00"
export function recurrenceText(e: EventItem, t: Translate, lang: Lang, now = Date.now()): string {
  const days = [...(e.recurrence_days || [])].sort((a, b) => a - b).map((d) => weekdayShort(d, lang)).join(", ");
  const { start } = eventWindow(e, now);
  const time = timeRange(e, start, lang);
  if (e.recurrence_freq === "monthly") {
    const firstDay = new Date(e.start_time).getDate();
    const nth = Math.floor((firstDay - 1) / 7) + 1;
    const which = nth >= 5 ? t("rec_last") : t(`rec_nth_${nth}`);
    return `${fill(t("rec_monthly"), { which, days })} · ${time}`;
  }
  const freq = e.recurrence_freq === "biweekly" ? t("rec_biweekly") : t("rec_weekly");
  return `${freq} · ${days} · ${time}`;
}

// Full date line: "Fr., 24. Okt. · 21:00–02:00" (recurring events: their rhythm).
export function formatWhen(e: EventItem, t: Translate, lang: Lang, now = Date.now()): string {
  if (e.is_recurring && e.recurrence_days?.length) return recurrenceText(e, t, lang, now);
  const { start } = eventWindow(e, now);
  return `${formatDay(start, lang)} · ${timeRange(e, start, lang)}`;
}

// Short state / countdown next to a "live" badge: "Noch bis 23:00" / "Seit 20:15", "Beendet", "in 25 Min.",
// "Heute, 20:00", "Morgen, 20:00", "Sa., 31. Okt., 20:00"
export function whenLabel(e: Timed, t: Translate, lang: Lang, now = Date.now()): string {
  if (e.status === "cancelled") return t("cancelled_badge");
  const { start, end } = eventWindow(e, now);
  if (start <= now && now < end) {
    // without an end time the 3 hours are only a guess: say since when it runs instead
    return e.end_time ? fill(t("live_until"), { time: formatTime(end, lang) }) : fill(t("live_since"), { time: formatTime(start, lang) });
  }
  if (now >= end) return t("ended_label");
  const mins = Math.round((start - now) / 60000);
  if (mins < 60) return fill(t("in_minutes"), { n: Math.max(1, mins) });
  const today = startOfDay(new Date(now)).getTime();
  const time = formatTime(start, lang);
  if (start < addDays(new Date(today), 1).getTime()) return fill(t("today_at"), { time });
  if (start < addDays(new Date(today), 2).getTime()) return fill(t("tomorrow_at"), { time });
  return `${formatDay(start, lang)}, ${time}`;
}
