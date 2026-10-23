import type { Deal } from "@/src/api/client";

// "K7QX9MPA" -> "K7QX-9MPA" (easier to read out loud at the counter)
export const formatDealCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

// "24.10., 20:14" (de) / "10/24, 08:14 PM" (en)
export function formatDealTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const locale = lang === "de" ? "de-DE" : "en-US";
  return `${d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}, ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

export function dealStatusText(deal: Pick<Deal, "status" | "redeemed_at">, t: (k: string) => string, lang: string): string {
  if (deal.status === "redeemed") return t("deal_status_redeemed").replace("{time}", formatDealTime(deal.redeemed_at, lang));
  return t(`deal_status_${deal.status}`);
}
