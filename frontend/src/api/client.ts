import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "localloop_session_token";
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// Errors keep the "<status>: <body>" message; `status` and the parsed `detail` are attached for callers that need them.
export type ApiError = Error & { status?: number; detail?: any };

export type NotificationType =
  | "join_request" | "request_approved" | "request_rejected" | "event_cancelled" | "event_updated" | "chat" | "reminder";

// One entry of the notification center; the app builds the text from `type` + `params`.
export type AppNotification = {
  id: string;
  type: NotificationType;
  params: Record<string, string>;
  action_url: string;
  event_id?: string;
  count?: number;
  created_at: string;
  read_at: string | null;
};

export type ReportTarget = "user" | "event" | "message";
export type ReportReason = "spam" | "harassment" | "hate" | "sexual" | "violence" | "fake" | "other";

// Structured errors carry a machine-readable code, e.g. { code: "event_over", message }.
export function errorCode(e: unknown): string | null {
  const d = (e as ApiError)?.detail;
  return d && typeof d === "object" && typeof d.code === "string" ? d.code : null;
}

// The backend rejects texts with blacklisted words: { code: "profanity", field, words }.
export function profanityWords(e: unknown): string[] | null {
  const d = (e as ApiError)?.detail;
  return d && typeof d === "object" && d.code === "profanity" ? (d.words as string[]) : null;
}

async function req(path: string, options: RequestInit = {}) {
  const headers = { ...(await authHeaders()), ...(options.headers || {}) };
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    const err: ApiError = new Error(`${res.status}: ${text}`);
    err.status = res.status;
    try { err.detail = JSON.parse(text).detail; } catch {}
    throw err;
  }
  return res.json();
}

// A claimed offer. `qr` is what the QR code encodes; the business scans it to redeem the deal once.
export type Deal = {
  id: string;
  code: string;
  qr: string;
  offer_title: string;
  event_id: string;
  event_title: string;
  business_name: string;
  start_time?: string | null;
  next_occurrence?: string | null;
  is_recurring?: boolean;
  recurrence_label?: string;
  claimed_at: string;
  redeemed_at?: string | null;
  status: "active" | "redeemed" | "cancelled" | "expired";
  already?: boolean;
};

export type RedeemResult = Deal & { guest_name: string; guest_picture?: string };

// upcoming → live → ended (still listed for 2 h) → past (gone from map and lists); or cancelled
export type EventPhase = "upcoming" | "live" | "ended" | "past" | "cancelled";

export type EventItem = {
  id: string;
  title: string;
  category: string;
  category_label?: string; // own text for category "other" ("Sonstiges")
  start_time: string;
  end_time?: string; // optional; without it the event counts as 3 hours long
  description: string;
  image_url: string;
  instagram: string;
  website: string;
  tickets_url: string;
  reservation_url?: string;
  capacity?: number;
  spots_taken?: number;
  rating?: number;
  rating_count?: number;
  latitude: number;
  longitude: number;
  pin_latitude?: number;
  pin_longitude?: number;
  address: string;
  checkins: number;
  live_count: number;
  is_hot: boolean;
  created_by: string;
  emoji?: string;
  banner_url?: string;
  venue_name?: string;
  verified?: boolean;
  is_recurring?: boolean;
  recurrence_freq?: string;
  recurrence_days?: number[];
  recurrence_label?: string;
  next_occurrence?: string; // recurring: the running or the next date
  ends_at?: string | null; // end of that occurrence
  occurrences?: string[]; // recurring: running + coming dates (≈ 2 months), used by the date filter
  phase?: EventPhase;
  is_live?: boolean;
  join_approval?: "auto" | "manual";
  age_restricted?: boolean;
  status?: "active" | "cancelled";
  cancelled_at?: string | null;
  offer_title?: string;
  offer_limit?: number;
  offer_claimed?: number;
  host_name?: string;
  host_is_business?: boolean;
  trend_score?: number;
};

// Host dashboard (GET /my/dashboard) — real numbers only, no simulated live counts.
export type DashboardEvent = {
  id: string;
  title: string;
  category: string;
  emoji?: string;
  image_url?: string;
  start_time: string;
  next_occurrence: string;
  is_recurring: boolean;
  recurrence_label?: string;
  recurrence_freq?: string;
  recurrence_days?: number[];
  end_time?: string;
  status: "active" | "cancelled";
  phase: "upcoming" | "past" | "cancelled";
  is_live?: boolean;
  capacity: number;
  join_approval: "auto" | "manual";
  rating: number;
  rating_count: number;
  checkins: number;
  saves: number;
  reviews: number;
  pending_requests: number;
  offer_title: string;
  offer_limit: number;
  deals_claimed: number;
  deals_redeemed: number;
};

// One row of the Chats tab (GET /my/chats). Archived chats (event over / cancelled) are read-only.
export type ChatSummary = {
  event_id: string;
  title: string;
  category: string;
  emoji?: string;
  image_url?: string;
  role: "host" | "guest";
  state: "active" | "ended" | "cancelled";
  is_live: boolean;
  is_recurring: boolean;
  start_time: string;
  next_occurrence?: string | null;
  ends_at?: string | null;
  cancelled_at?: string | null;
  members: number;
  unread: number;
  last_message: {
    user_id: string; user_name: string; text: string; system: boolean; system_key?: string | null; created_at: string;
  } | null;
  last_activity: string;
};

export type DashboardRequest = {
  user_id: string;
  name?: string;
  picture?: string;
  birthdate?: string;
  identity_verified?: boolean;
  event_id: string;
  event_title: string;
  requested_at?: string;
};

export type DashboardReview = {
  id: string;
  event_id: string;
  event_title: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type Dashboard = {
  totals: {
    events: number;
    active_events: number;
    checkins: number;
    checkins_7d: number;
    saves: number;
    reviews: number;
    pending_requests: number;
    rating: number;
    rating_count: number;
    offers: number;
    deals_claimed: number;
    deals_redeemed: number;
  };
  checkins_by_day: { date: string; count: number }[];
  events: DashboardEvent[];
  requests: DashboardRequest[];
  recent_reviews: DashboardReview[];
};

export const api = {
  listEvents: (category?: string): Promise<EventItem[]> =>
    req(`/events${category && category !== "all" ? `?category=${category}` : ""}`),
  getEvent: (id: string): Promise<EventItem> => req(`/events/${id}`),
  createEvent: (payload: any): Promise<EventItem> =>
    req(`/events`, { method: "POST", body: JSON.stringify(payload) }),
  updateEvent: (id: string, payload: any): Promise<EventItem> =>
    req(`/events/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  checkin: (id: string, body?: { visibility?: string; at_venue?: boolean }): Promise<EventItem & { checked_in: boolean; pending?: boolean }> =>
    req(`/events/${id}/checkin`, { method: "POST", body: JSON.stringify(body || {}) }),
  checkinStatus: (id: string): Promise<{ checked_in: boolean; pending?: boolean }> =>
    req(`/events/${id}/checkin-status`),
  participants: (id: string): Promise<{ count: number; participants: any[] }> =>
    req(`/events/${id}/participants`),

  // Host controls
  eventRequests: (id: string): Promise<{ count: number; requests: any[] }> => req(`/events/${id}/requests`),
  approveRequest: (id: string, userId: string) => req(`/events/${id}/requests/${userId}/approve`, { method: "POST" }),
  rejectRequest: (id: string, userId: string) => req(`/events/${id}/requests/${userId}/reject`, { method: "POST" }),
  cancelEvent: (id: string): Promise<EventItem> => req(`/events/${id}/cancel`, { method: "POST" }),

  // Saves
  toggleSave: (id: string): Promise<{ saved: boolean }> => req(`/events/${id}/save`, { method: "POST" }),
  saveStatus: (id: string): Promise<{ saved: boolean }> => req(`/events/${id}/save-status`),
  mySaved: (): Promise<EventItem[]> => req(`/my/saved`),
  myAttending: (): Promise<EventItem[]> => req(`/my/attending`),
  myChats: (): Promise<ChatSummary[]> => req(`/my/chats`),
  hideChat: (eventId: string) => req(`/chats/${eventId}/hide`, { method: "POST" }),
  myDashboard: (): Promise<Dashboard> => req(`/my/dashboard?tz_offset=${new Date().getTimezoneOffset()}`),

  // Deals (business offers)
  claimDeal: (eventId: string): Promise<Deal> => req(`/events/${eventId}/deal`, { method: "POST" }),
  myEventDeal: (eventId: string): Promise<{ deal: Deal | null }> => req(`/events/${eventId}/deal`),
  myDeals: (): Promise<Deal[]> => req(`/my/deals`),
  redeemDeal: (code: string): Promise<RedeemResult> =>
    req(`/deals/redeem`, { method: "POST", body: JSON.stringify({ code }) }),

  // Push
  registerPush: (payload: { user_id: string; platform: string; device_token: string }) =>
    req(`/register-push`, { method: "POST", body: JSON.stringify(payload) }),

  // Profile
  updateProfile: (payload: any) => req(`/profile`, { method: "PATCH", body: JSON.stringify(payload) }),

  // Reviews / ratings
  getReviews: (id: string): Promise<any[]> => req(`/events/${id}/reviews`),
  postReview: (id: string, rating: number, comment: string) =>
    req(`/events/${id}/reviews`, { method: "POST", body: JSON.stringify({ rating, comment }) }),

  // Crews
  leaveCrew: (id: string) => req(`/crews/${id}/leave`, { method: "POST" }),

  // Public profile + account
  getUser: (id: string): Promise<any> => req(`/users/${id}`),
  deleteAccount: () => req(`/profile`, { method: "DELETE" }),

  // Notification center
  notifications: (): Promise<{ unread: number; items: AppNotification[] }> => req(`/notifications`),
  unreadNotifications: (): Promise<{ unread: number }> => req(`/notifications/unread-count`),
  markNotificationsRead: (ids?: string[]) =>
    req(`/notifications/read`, { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }),

  // Moderation
  report: (target_type: ReportTarget, target_id: string, reason: ReportReason, note = "") =>
    req(`/reports`, { method: "POST", body: JSON.stringify({ target_type, target_id, reason, note }) }),
  toggleBlock: (userId: string): Promise<{ blocked: boolean }> => req(`/users/${userId}/block`, { method: "POST" }),
  myBlocks: (): Promise<{ user_id: string; name?: string; picture?: string; account_type?: string; business_name?: string }[]> =>
    req(`/my/blocks`),

  // Chat
  getMessages: (id: string): Promise<any[]> => req(`/events/${id}/messages`),
  sendMessage: (id: string, text: string) =>
    req(`/events/${id}/messages`, { method: "POST", body: JSON.stringify({ text }) }),

  // Crews
  createCrew: (name: string) => req(`/crews`, { method: "POST", body: JSON.stringify({ name }) }),
  myCrews: (): Promise<any[]> => req(`/crews`),
  getCrew: (id: string): Promise<any> => req(`/crews/${id}`),
  joinCrew: (invite_code: string) => req(`/crews/join`, { method: "POST", body: JSON.stringify({ invite_code }) }),
  addSuggestion: (crewId: string, payload: { event_id?: string; custom_text?: string }) =>
    req(`/crews/${crewId}/suggestions`, { method: "POST", body: JSON.stringify(payload) }),
  voteSuggestion: (crewId: string, sugId: string) =>
    req(`/crews/${crewId}/suggestions/${sugId}/vote`, { method: "POST" }),

  createAuthSession: (session_id: string) =>
    req(`/auth/session`, { method: "POST", body: JSON.stringify({ session_id }) }),
  devSession: () => req(`/auth/dev-session`, { method: "POST" }),
  me: () => req(`/auth/me`),
  logout: () => req(`/auth/logout`, { method: "POST" }),
};
