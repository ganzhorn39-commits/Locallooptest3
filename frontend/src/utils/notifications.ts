import type { AppNotification } from "@/src/api/client";

type T = (k: string) => string;

const fill = (text: string, params: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));

const locale = (lang: string) => (lang === "de" ? "de-DE" : "en-US");

// "heute um 19:00" / "morgen um 19:00" / "in 40 Min." / a date
export function startsWhen(iso: string, t: T, lang: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  if (mins > 0 && mins < 60) return fill(t("when_in_min"), { n: mins });
  const time = d.toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return fill(t("when_today"), { time });
  if (d.toDateString() === tomorrow.toDateString()) return fill(t("when_tomorrow"), { time });
  return d.toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short" }) + ` · ${time}`;
}

// "gerade eben" / "vor 5 Min." / "vor 3 Std." / "gestern" / "24.10."
export function timeAgo(iso: string, t: T, lang: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t("time_now");
  if (mins < 60) return fill(t("time_min"), { n: mins });
  if (mins < 24 * 60) return fill(t("time_hours"), { n: Math.floor(mins / 60) });
  if (mins < 48 * 60) return t("time_yesterday");
  return d.toLocaleDateString(locale(lang), { day: "2-digit", month: "2-digit" });
}

export function notificationText(n: AppNotification, t: T, lang: string): { title: string; body?: string } {
  const p = n.params || {};
  switch (n.type) {
    case "event_updated":
      return { title: fill(t(`notif_event_updated_${p.what || "time"}`), p) };
    case "chat":
      return (n.count || 1) > 1
        ? { title: fill(t("notif_chat_many"), { ...p, count: n.count || 1 }), body: `${p.user_name}: ${p.text}` }
        : { title: fill(t("notif_chat_one"), p), body: p.text };
    case "reminder":
      return { title: fill(t("notif_reminder"), { ...p, when: startsWhen(p.start_time, t, lang) }) };
    case "followed_event":
      return { title: fill(t("notif_followed_event"), p), body: p.start_time ? startsWhen(p.start_time, t, lang) : undefined };
    default:
      return { title: fill(t(`notif_${n.type}`), p) };
  }
}

export const NOTIFICATION_ICON: Record<string, { icon: string; tone: "brand" | "accent" | "error" | "warning" }> = {
  join_request: { icon: "person-add", tone: "accent" },
  request_approved: { icon: "checkmark-circle", tone: "accent" },
  request_rejected: { icon: "close-circle", tone: "error" },
  event_cancelled: { icon: "close-circle", tone: "error" },
  event_updated: { icon: "create", tone: "warning" },
  chat: { icon: "chatbubbles", tone: "brand" },
  reminder: { icon: "alarm", tone: "brand" },
  new_follower: { icon: "person-add", tone: "accent" },
  followed_event: { icon: "sparkles", tone: "brand" },
};
