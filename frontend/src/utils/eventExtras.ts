import { Platform } from "react-native";
import * as Calendar from "expo-calendar/legacy";
import { api, EventItem } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { eventWindow } from "@/src/utils/eventTime";

const DEVICE_KEY = "localloop_device_id";
const seen = new Set<string>();

// Counts one view per event and app session (the server counts each person once per day; the host is ignored).
export async function recordView(eventId: string) {
  if (seen.has(eventId)) return;
  seen.add(eventId);
  try {
    let id = await storage.getItem<string>(DEVICE_KEY, "");
    if (!id) {
      id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      await storage.setItem(DEVICE_KEY, id);
    }
    await api.recordView(eventId, id);
  } catch {}
}

const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

// "Zum Kalender hinzufügen": the phone's own add-event form; in the browser an .ics file.
export async function addToCalendar(e: EventItem): Promise<"added" | "canceled" | "downloaded" | "failed"> {
  const { start, end } = eventWindow(e);
  const location = [e.venue_name, e.address].filter(Boolean).join(", ");
  if (Platform.OS === "web") {
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LocalLoop//DE", "BEGIN:VEVENT",
      `UID:${e.id}-${start}@localloop.app`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(e.title)}`, `LOCATION:${icsText(location)}`, `DESCRIPTION:${icsText(e.description || "")}`,
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    try {
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${e.title.replace(/[^\w\- ]+/g, "").trim() || "event"}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "downloaded";
    } catch { return "failed"; }
  }
  try {
    const res = await Calendar.createEventInCalendarAsync({
      title: e.title, startDate: new Date(start), endDate: new Date(end), location, notes: e.description || "",
    });
    return res.action === "canceled" ? "canceled" : "added";
  } catch { return "failed"; }
}
