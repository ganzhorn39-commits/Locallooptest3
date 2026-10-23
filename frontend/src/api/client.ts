import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "localloop_session_token";
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function req(path: string, options: RequestInit = {}) {
  const headers = { ...(await authHeaders()), ...(options.headers || {}) };
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export type EventItem = {
  id: string;
  title: string;
  category: string;
  start_time: string;
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
  recurrence_label?: string;
  next_occurrence?: string;
  join_approval?: "auto" | "manual";
  age_restricted?: boolean;
  status?: "active" | "cancelled";
  cancelled_at?: string | null;
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
  status: "active" | "cancelled";
  phase: "upcoming" | "past" | "cancelled";
  capacity: number;
  join_approval: "auto" | "manual";
  rating: number;
  rating_count: number;
  checkins: number;
  saves: number;
  reviews: number;
  pending_requests: number;
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
  myDashboard: (): Promise<Dashboard> => req(`/my/dashboard?tz_offset=${new Date().getTimezoneOffset()}`),

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
