from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import logging
import random
import re
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from moderation import censor_text, find_bad_words
import event_time
from event_time import HIDE_AFTER_END, MAX_DURATION, current_window, is_recurring, parse_iso, upcoming_starts


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# ----------------------------- Push (Emergent relay) -----------------------------
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


async def send_push(recipients, data, idempotency_key=None):
    if not recipients:
        return
    recipients = recipients[:100]
    payload = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    resp.raise_for_status()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


# ----------------------------- In-app notifications (+ push) -----------------------------
# Every push also lands in the notification center (bell). The app renders the texts itself from
# `type` + `params`; push texts are built here in the recipient's language (users.lang, default en).
NOTIF_TEXTS = {
    "join_request": {"de": ("Neue Beitrittsanfrage 🙋", "{user_name} möchte zu „{event_title}“"),
                     "en": ("New join request 🙋", "{user_name} wants to join \"{event_title}\"")},
    "request_approved": {"de": ("Anfrage angenommen ✅", "Du bist dabei: „{event_title}“"),
                         "en": ("Request approved ✅", "You're in for \"{event_title}\"")},
    "request_rejected": {"de": ("Anfrage abgelehnt", "Deine Anfrage für „{event_title}“ wurde abgelehnt."),
                         "en": ("Request declined", "Your request for \"{event_title}\" was declined.")},
    "event_cancelled": {"de": ("Event abgesagt ❌", "„{event_title}“ wurde vom Veranstalter abgesagt."),
                        "en": ("Event cancelled ❌", "\"{event_title}\" has been cancelled by the host.")},
    "event_updated": {"de": ("Event geändert ✏️", "„{event_title}“ hat eine neue {what_de}."),
                      "en": ("Event updated ✏️", "\"{event_title}\" has a new {what_en}.")},
    "chat": {"de": ("{user_name} · {event_title}", "{text}"), "en": ("{user_name} · {event_title}", "{text}")},
}
WHAT_TEXT = {"time": ("Uhrzeit", "time"), "place": ("Adresse", "place"), "time_place": ("Zeit und Adresse", "time and place")}
REMINDER_WINDOW = timedelta(hours=24)


def _fmt(template: str, params: dict) -> str:
    try:
        return template.format(**params)
    except (KeyError, IndexError, ValueError):
        return template


async def notify(recipients, ntype: str, params: dict, action_url: str, event_id: Optional[str] = None,
                 actor_id: Optional[str] = None, push: bool = True):
    """Store an in-app notification for each recipient and send a push (non-blocking on push errors)."""
    recipients = [r for r in dict.fromkeys(recipients) if r and r != "system" and r != actor_id]
    if actor_id and recipients:  # people who blocked the actor don't hear from them
        blockers = await db.blocks.find({"blocked_id": actor_id, "user_id": {"$in": recipients}}, {"_id": 0, "user_id": 1}).to_list(None)
        blocked_by = {b["user_id"] for b in blockers}
        recipients = [r for r in recipients if r not in blocked_by]
    if not recipients:
        return
    now = now_utc().isoformat()
    if ntype == "chat":
        # One unread entry per chat: newer messages update it and count up.
        for r in recipients:
            await db.notifications.update_one(
                {"user_id": r, "type": "chat", "event_id": event_id, "read_at": None},
                {"$set": {"params": params, "action_url": action_url, "created_at": now},
                 "$inc": {"count": 1}, "$setOnInsert": {"id": str(uuid.uuid4())}},
                upsert=True,
            )
    else:
        await db.notifications.insert_many([
            {"id": str(uuid.uuid4()), "user_id": r, "type": ntype, "params": params, "action_url": action_url,
             "event_id": event_id, "count": 1, "created_at": now, "read_at": None}
            for r in recipients
        ])
    if not push or ntype not in NOTIF_TEXTS:
        return
    prefs = await db.users.find({"user_id": {"$in": recipients}}, {"_id": 0, "user_id": 1, "lang": 1, "push_events": 1, "push_messages": 1}).to_list(None)
    pref_key = "push_messages" if ntype == "chat" else "push_events"
    by_lang: dict = {"de": [], "en": []}
    for u in prefs:
        if u.get(pref_key, True) is not False:
            by_lang["de" if u.get("lang") == "de" else "en"].append(u["user_id"])
    for lang, ids in by_lang.items():
        title, body = NOTIF_TEXTS[ntype][lang]
        for i in range(0, len(ids), 100):  # the relay takes at most 100 recipients per call
            try:
                await send_push(ids[i:i + 100], {"title": _fmt(title, params), "message": _fmt(body, params), "action_url": action_url})
            except Exception as e:
                logger.warning(f"{ntype} push failed (non-blocking): {e}")


async def ensure_reminders(user: dict):
    """Create (once) a reminder for events the user is going to or saved that start within 24h.
    Generated when the user looks at notifications, so no background scheduler is needed."""
    uid = user["user_id"]
    ids = {c["event_id"] for c in await db.checkins.find({"user_id": uid}, {"_id": 0, "event_id": 1}).to_list(500)}
    ids |= {s["event_id"] for s in await db.saves.find({"user_id": uid}, {"_id": 0, "event_id": 1}).to_list(500)}
    if not ids:
        return
    now = now_utc()
    for ev in await db.events.find({"id": {"$in": list(ids)}, "status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(500):
        start = parse_iso(compute_next_occurrence(ev))
        if not start or not (now < start <= now + REMINDER_WINDOW):
            continue
        key = f"reminder:{ev['id']}:{start.isoformat()}"
        await db.notifications.update_one(
            {"user_id": uid, "dedupe_key": key},
            {"$setOnInsert": {"id": str(uuid.uuid4()), "user_id": uid, "type": "reminder", "dedupe_key": key,
                              "params": {"event_title": ev.get("title", ""), "start_time": start.isoformat()},
                              "action_url": f"/event/{ev['id']}", "event_id": ev["id"], "count": 1,
                              "created_at": now.isoformat(), "read_at": None}},
            upsert=True,
        )


# ----------------------------- Models -----------------------------
def now_utc():
    return datetime.now(timezone.utc)


class EventCreate(BaseModel):
    title: str
    category: str  # nightlife | food | sports | culture
    start_time: str  # ISO string
    end_time: str = ""  # optional ISO string; without it the event is assumed to last 3 hours
    description: str = ""
    image_url: str = ""
    banner_url: str = ""
    emoji: str = ""
    instagram: str = ""
    website: str = ""
    tickets_url: str = ""
    reservation_url: str = ""
    capacity: int = 0  # 0 = unlimited
    latitude: float
    longitude: float
    address: str = ""
    venue_name: str = ""
    is_recurring: bool = False
    recurrence_freq: str = ""  # weekly | biweekly | monthly
    recurrence_days: List[int] = []  # 0=Mon ... 6=Sun
    recurrence_label: str = ""
    join_approval: str = "auto"  # auto | manual
    age_restricted: bool = False
    offer_title: str = ""  # business accounts only, e.g. "10% auf Kaffee"
    offer_limit: int = 0  # how many deals can be claimed in total; 0 = unlimited


class Event(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    category: str
    start_time: str
    end_time: str = ""
    description: str = ""
    image_url: str = ""
    banner_url: str = ""
    emoji: str = ""
    instagram: str = ""
    website: str = ""
    tickets_url: str = ""
    reservation_url: str = ""
    capacity: int = 0
    latitude: float
    longitude: float
    address: str = ""
    venue_name: str = ""
    verified: bool = False
    rating: float = 0.0
    rating_count: int = 0
    is_recurring: bool = False
    recurrence_freq: str = ""
    recurrence_days: List[int] = []
    recurrence_label: str = ""
    join_approval: str = "auto"  # auto | manual
    age_restricted: bool = False
    status: str = "active"  # active | cancelled
    cancelled_at: Optional[str] = None
    offer_title: str = ""
    offer_limit: int = 0
    offer_claimed: int = 0  # deals handed out (kept in sync with db.deals, used to enforce the limit atomically)
    checkins: int = 0
    created_by: str = "demo"
    created_at: str = Field(default_factory=lambda: now_utc().isoformat())


class SessionRequest(BaseModel):
    session_id: str


# ----------------------------- Auth -----------------------------
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_optional_user(authorization: Optional[str] = Header(None)):
    """Like get_current_user, but guests (no/invalid token) get None instead of a 401."""
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None


async def blocked_ids(user: Optional[dict]) -> set:
    """Users this person has blocked: their messages, events and avatars are hidden for them."""
    if not user:
        return set()
    rows = await db.blocks.find({"user_id": user["user_id"]}, {"_id": 0, "blocked_id": 1}).to_list(None)
    return {r["blocked_id"] for r in rows}


def reject_bad_words(fields: dict):
    """400 if a text others will see contains blacklisted words (see moderation.py)."""
    for field, value in fields.items():
        words = find_bad_words(value or "") if isinstance(value, str) else []
        if words:
            raise HTTPException(status_code=400, detail={"code": "profanity", "field": field, "words": words})


@api_router.post("/auth/session")
async def create_session(req: SessionRequest):
    async with httpx.AsyncClient(timeout=15) as hc:
        resp = await hc.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": req.session_id})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session id")
    data = resp.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": data.get("name"), "picture": data.get("picture")}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "account_type": "user",
            "onboarded": False,
            "created_at": now_utc().isoformat(),
        })
    session_token = data["session_token"]
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": (now_utc() + timedelta(days=7)),
            "created_at": now_utc(),
        }},
        upsert=True,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


class DevSessionBody(BaseModel):
    alias: str = ""  # optional: separate demo users (demo+<alias>@localloop.app), e.g. host + guest in tests


@api_router.post("/auth/dev-session")
async def dev_session(body: Optional[DevSessionBody] = None):
    """Preview-only login for automated testing. Guarded by ALLOW_DEV_LOGIN env."""
    if os.environ.get("ALLOW_DEV_LOGIN", "").lower() != "true":
        raise HTTPException(status_code=404, detail="Not found")
    alias = (body.alias if body else "").strip().lower()
    if alias and not re.fullmatch(r"[a-z0-9_-]{1,32}", alias):
        raise HTTPException(status_code=400, detail="Invalid alias")
    email = f"demo+{alias}@localloop.app" if alias else "demo@localloop.app"
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": f"Demo {alias}" if alias else "Demo Explorer",
            "picture": "", "created_at": now_utc().isoformat(),
        })
    session_token = f"dev_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": session_token, "user_id": user_id,
        "expires_at": (now_utc() + timedelta(days=7)), "created_at": now_utc(),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


@api_router.get("/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ----------------------------- Events -----------------------------
def lifecycle(doc: dict, now: Optional[datetime] = None) -> str:
    """upcoming | live | ended (over, still listed for 2h) | past (gone from map and lists) | cancelled."""
    return event_time.phase(doc, now or now_utc())


def with_live_count(doc: dict) -> dict:
    """Add a simulated live-pulse jitter on top of real checkins + when the event happens (phase, dates)."""
    base = doc.get("checkins", 0)
    jitter = random.randint(0, 18) + (hash(doc["id"]) % 40)
    doc["live_count"] = base + abs(jitter)
    doc["is_hot"] = doc["live_count"] > 45
    doc["spots_taken"] = base
    doc["capacity"] = doc.get("capacity", 0)
    # Location fuzzing: public pins are offset ~200-500m ("a few streets away") for privacy.
    seed = hash(doc["id"])
    off_lat = (((seed % 1000) / 1000) - 0.5) * 0.008
    off_lng = ((((seed // 1000) % 1000) / 1000) - 0.5) * 0.008
    doc["pin_latitude"] = round(doc.get("latitude", 0) + off_lat, 6)
    doc["pin_longitude"] = round(doc.get("longitude", 0) + off_lng, 6)
    now = now_utc()
    start, end = current_window(doc, now)
    # recurring: the running or the next date; one-off events keep their stored start string
    doc["next_occurrence"] = start.isoformat() if start and is_recurring(doc) else doc.get("start_time")
    doc["ends_at"] = end.isoformat() if end else None
    doc["phase"] = lifecycle(doc, now)
    doc["is_live"] = doc["phase"] == "live"
    if is_recurring(doc):
        doc["occurrences"] = upcoming_starts(doc, now)  # coming dates for the app's date filter
    doc.setdefault("end_time", "")
    return doc


def compute_next_occurrence(doc: dict) -> str:
    """Start of the running or the next occurrence (one-off events: their start)."""
    if not is_recurring(doc):
        return doc.get("start_time")
    start, _ = current_window(doc, now_utc())
    return start.isoformat() if start else doc.get("start_time")


async def attach_hosts(docs: List[dict]) -> List[dict]:
    """Add host_name / host_is_business (search by business name, business pins, host filter) in one query."""
    ids = list({d.get("created_by") for d in docs if d.get("created_by")})
    hosts = await db.users.find(
        {"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "account_type": 1, "business_name": 1}
    ).to_list(None)
    hosts = {h["user_id"]: h for h in hosts}
    for d in docs:
        h = hosts.get(d.get("created_by"), {})
        is_biz = h.get("account_type") == "business"
        d["host_is_business"] = is_biz
        d["host_name"] = (h.get("business_name") or d.get("venue_name") or h.get("name") or "") if is_biz else (h.get("name") or "")
    return docs


DEMO_HOST = "seed_business"  # owner of the seeded Karlsruhe demo venues
ROLL_DEMO_EVENTS = os.environ.get("ROLL_DEMO_EVENTS", "true").lower() != "false"
_demo_checked_at: Optional[datetime] = None


async def roll_demo_events(force: bool = False):
    """Keep the demo map alive: a seeded one-off demo event that is over moves on by whole weeks
    (same weekday and time). Switch off with ROLL_DEMO_EVENTS=false once real events are there."""
    global _demo_checked_at
    now = now_utc()
    if not ROLL_DEMO_EVENTS or (not force and _demo_checked_at and now - _demo_checked_at < timedelta(minutes=10)):
        return
    _demo_checked_at = now
    docs = await db.events.find({"created_by": DEMO_HOST, "is_recurring": {"$ne": True}, "status": {"$ne": "cancelled"}},
                                {"_id": 0}).to_list(500)
    for ev in docs:
        start = parse_iso(ev.get("start_time"))
        if not start or lifecycle(ev, now) != "past":
            continue
        gone_since = now - (start + event_time.duration(ev) + HIDE_AFTER_END)
        shift = timedelta(days=7 * (gone_since // timedelta(days=7) + 1))
        upd = {"start_time": (start + shift).isoformat()}
        end = parse_iso(ev.get("end_time"))
        if end:
            upd["end_time"] = (end + shift).isoformat()
        await db.events.update_one({"id": ev["id"]}, {"$set": upd})


@api_router.get("/events")
async def list_events(category: Optional[str] = None, user=Depends(get_optional_user)):
    # Cancelled events and events that ended more than 2h ago leave the map and the lists
    # (their page and chat stay reachable by link and from the Chats tab).
    await roll_demo_events()
    now = now_utc()
    recent = (now - MAX_DURATION - HIDE_AFTER_END - timedelta(days=1)).isoformat()  # coarse pre-filter, exact check below
    query: dict = {"status": {"$ne": "cancelled"}, "$or": [{"is_recurring": True}, {"start_time": {"$gte": recent}}]}
    if category and category != "all":
        query["category"] = category
    hidden_hosts = await blocked_ids(user)
    if hidden_hosts:
        query["created_by"] = {"$nin": list(hidden_hosts)}
    docs = [d for d in await db.events.find(query, {"_id": 0}).to_list(1000) if lifecycle(d, now) != "past"]
    ids = [d["id"] for d in docs]
    # "Trending" uses real activity only: check-ins + saves.
    checkins = await counts_by_event(db.checkins, {"event_id": {"$in": ids}})
    saves = await counts_by_event(db.saves, {"event_id": {"$in": ids}})
    for d in docs:
        d["trend_score"] = checkins.get(d["id"], 0) + saves.get(d["id"], 0)
    return [with_live_count(d) for d in await attach_hosts(docs)]


@api_router.get("/events/{event_id}")
async def get_event(event_id: str):
    doc = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Event not found")
    return with_live_count((await attach_hosts([doc]))[0])


OFFER_MAX_LEN = 80


async def check_offer(user: dict, title: str, limit: int, event_id: Optional[str] = None):
    """Validate an event offer. Only business accounts may attach one; returns (title, limit)."""
    title = (title or "").strip()
    limit = max(0, int(limit or 0))
    if len(title) > OFFER_MAX_LEN:
        raise HTTPException(status_code=400, detail=f"Offer text is too long (max {OFFER_MAX_LEN})")
    if title and user.get("account_type") != "business":
        raise HTTPException(status_code=403, detail="Only business accounts can add offers")
    if event_id and limit:
        claimed = await db.deals.count_documents({"event_id": event_id})
        if limit < claimed:
            raise HTTPException(status_code=409, detail=f"Offer limit below claimed deals ({claimed})")
    return title, limit


def check_times(start_iso: Optional[str], end_iso: Optional[str]):
    """Start must be a valid time; an end time (optional) must come after it and within 7 days."""
    start = parse_iso(start_iso)
    if not start:
        raise HTTPException(status_code=400, detail="Invalid start_time")
    if end_iso:
        end = parse_iso(end_iso)
        if not end:
            raise HTTPException(status_code=400, detail="Invalid end_time")
        if end <= start:
            raise HTTPException(status_code=400, detail={"code": "end_before_start", "message": "The end must be after the start"})
        if end - start > MAX_DURATION:
            raise HTTPException(status_code=400, detail={"code": "too_long", "message": "An event can last at most 7 days"})
    return start


@api_router.post("/events")
async def create_event(payload: EventCreate, user=Depends(get_current_user)):
    data = payload.dict()
    reject_bad_words({k: data.get(k) for k in ("title", "description", "offer_title", "venue_name")})
    data["end_time"] = (data.get("end_time") or "").strip()
    check_times(data["start_time"], data["end_time"])
    if lifecycle(data) in ("ended", "past"):  # a running event is fine ("we're here, come by")
        raise HTTPException(status_code=400, detail={"code": "event_over", "message": "This time is already over"})
    data["offer_title"], data["offer_limit"] = await check_offer(user, data["offer_title"], data["offer_limit"])
    event = Event(**data, created_by=user["user_id"])
    await db.events.insert_one(event.dict())
    return with_live_count(event.dict())


class EventUpdate(BaseModel):
    # Every field optional: only what is sent gets changed. Host/status/counters are not editable here.
    title: Optional[str] = None
    category: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None  # "" removes the end time
    description: Optional[str] = None
    image_url: Optional[str] = None
    banner_url: Optional[str] = None
    emoji: Optional[str] = None
    instagram: Optional[str] = None
    website: Optional[str] = None
    tickets_url: Optional[str] = None
    reservation_url: Optional[str] = None
    capacity: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    venue_name: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_freq: Optional[str] = None
    recurrence_days: Optional[List[int]] = None
    recurrence_label: Optional[str] = None
    join_approval: Optional[str] = None
    age_restricted: Optional[bool] = None
    offer_title: Optional[str] = None  # "" removes the offer (already claimed deals stay valid)
    offer_limit: Optional[int] = None


@api_router.patch("/events/{event_id}")
async def update_event(event_id: str, payload: EventUpdate, user=Depends(get_current_user)):
    ev = await require_host(event_id, user)
    if ev.get("status") == "cancelled":
        raise HTTPException(status_code=409, detail="Event cancelled")
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    reject_bad_words({k: updates.get(k) for k in ("title", "description", "offer_title", "venue_name")})
    if "title" in updates:
        updates["title"] = updates["title"].strip()
        if not updates["title"]:
            raise HTTPException(status_code=400, detail="Title is required")
    if "start_time" in updates or "end_time" in updates:
        if "end_time" in updates:
            updates["end_time"] = updates["end_time"].strip()
        check_times(updates.get("start_time", ev.get("start_time")), updates.get("end_time", ev.get("end_time", "")))
    if updates.get("join_approval", "auto") not in ("auto", "manual"):
        raise HTTPException(status_code=400, detail="Invalid join_approval")
    if "capacity" in updates:
        updates["capacity"] = max(0, updates["capacity"])
        going = await db.checkins.count_documents({"event_id": event_id})
        if 0 < updates["capacity"] < going:
            raise HTTPException(status_code=409, detail=f"Capacity below current check-ins ({going})")
    if "offer_title" in updates or "offer_limit" in updates:
        updates["offer_title"], updates["offer_limit"] = await check_offer(
            user, updates.get("offer_title", ev.get("offer_title", "")),
            updates.get("offer_limit", ev.get("offer_limit", 0)), event_id,
        )
    if not updates:
        return with_live_count(ev)

    await db.events.update_one({"id": event_id}, {"$set": updates})
    updated = await db.events.find_one({"id": event_id}, {"_id": 0})

    # Attendees (and open requests) hear about it when the time or the place changes.
    time_changed = (
        parse_iso(updated.get("start_time")) != parse_iso(ev.get("start_time"))
        or bool(updated.get("is_recurring")) != bool(ev.get("is_recurring"))
        or sorted(updated.get("recurrence_days") or []) != sorted(ev.get("recurrence_days") or [])
    )
    place_changed = (
        (updated.get("address") or "").strip() != (ev.get("address") or "").strip()
        or abs(float(updated.get("latitude", 0)) - float(ev.get("latitude", 0))) > 1e-4
        or abs(float(updated.get("longitude", 0)) - float(ev.get("longitude", 0))) > 1e-4
    )
    if time_changed or place_changed:
        what_key = "time_place" if time_changed and place_changed else ("time" if time_changed else "place")
        what = {"time_place": "time and place", "time": "time", "place": "place"}[what_key]
        try:
            await db.messages.insert_one({
                "id": str(uuid.uuid4()), "event_id": event_id, "user_id": "system",
                "user_name": "LocalLoop", "user_picture": "", "system": True, "system_key": f"updated_{what_key}",
                "text": f"✏️ The host changed the {what} of this event. Check the details before you go.",
                "created_at": now_utc().isoformat(),
            })
            att = await db.checkins.find({"event_id": event_id}).to_list(500)
            reqs = await db.join_requests.find({"event_id": event_id, "status": "pending"}).to_list(500)
            await notify(
                [a["user_id"] for a in att] + [r["user_id"] for r in reqs], "event_updated",
                {"event_title": updated["title"], "what": what_key, "what_de": WHAT_TEXT[what_key][0], "what_en": WHAT_TEXT[what_key][1]},
                f"/event/{event_id}", event_id=event_id, actor_id=user["user_id"],
            )
        except Exception as e:
            logger.warning(f"update notify failed (non-blocking): {e}")
    return with_live_count(updated)


class CheckinBody(BaseModel):
    visibility: str = "public"  # public | friends | anonymous
    at_venue: bool = False


@api_router.post("/events/{event_id}/checkin")
async def checkin(event_id: str, body: CheckinBody = CheckinBody(), user=Depends(get_current_user)):
    doc = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Event not found")
    uid = user["user_id"]
    is_host = doc.get("created_by") == uid
    already = await db.checkins.find_one({"event_id": event_id, "user_id": uid})
    pending_req = await db.join_requests.find_one({"event_id": event_id, "user_id": uid, "status": "pending"})
    checked_in = False
    is_pending = False
    if already:
        await db.checkins.delete_one({"event_id": event_id, "user_id": uid})
        await db.events.update_one({"id": event_id}, {"$inc": {"checkins": -1}})
        # Leaving the event hands an unused deal back to the pool (redeemed deals stay as history).
        released = await db.deals.delete_one({"event_id": event_id, "user_id": uid, "redeemed_at": None})
        if released.deleted_count:
            await db.events.update_one({"id": event_id}, {"$inc": {"offer_claimed": -1}})
    elif pending_req:
        # toggle off a pending request
        await db.join_requests.delete_one({"event_id": event_id, "user_id": uid})
    else:
        # Leaving (above) always works, joining only while the event is on.
        state = lifecycle(doc)
        if state == "cancelled":
            raise HTTPException(status_code=409, detail="Event cancelled")
        if state in ("ended", "past"):
            raise HTTPException(status_code=409, detail="Event is over")
        capacity = int(doc.get("capacity", 0) or 0)
        if capacity > 0:
            current = await db.checkins.count_documents({"event_id": event_id})
            if current >= capacity:
                raise HTTPException(status_code=409, detail="Event is full")
        vis = body.visibility if body.visibility in ("public", "friends", "anonymous") else "public"
        if doc.get("join_approval") == "manual" and not is_host:
            await db.join_requests.update_one(
                {"event_id": event_id, "user_id": uid},
                {"$set": {"event_id": event_id, "user_id": uid, "status": "pending",
                          "visibility": vis, "at_venue": bool(body.at_venue), "at": now_utc().isoformat()}},
                upsert=True,
            )
            is_pending = True
            try:
                await notify([doc.get("created_by")], "join_request",
                             {"user_name": user.get("name") or "Someone", "event_title": doc["title"]},
                             "/dashboard", event_id=event_id, actor_id=uid)
            except Exception as e:
                logger.warning(f"request notify failed (non-blocking): {e}")
        else:
            await db.checkins.insert_one({
                "event_id": event_id, "user_id": uid, "at": now_utc().isoformat(),
                "visibility": vis, "at_venue": bool(body.at_venue),
            })
            await db.events.update_one({"id": event_id}, {"$inc": {"checkins": 1}})
            checked_in = True
    updated = await db.events.find_one({"id": event_id}, {"_id": 0})
    result = with_live_count(updated)
    result["checked_in"] = checked_in
    result["pending"] = is_pending
    return result


@api_router.get("/events/{event_id}/checkin-status")
async def checkin_status(event_id: str, user=Depends(get_current_user)):
    uid = user["user_id"]
    already = await db.checkins.find_one({"event_id": event_id, "user_id": uid})
    pending_req = await db.join_requests.find_one({"event_id": event_id, "user_id": uid, "status": "pending"})
    return {"checked_in": bool(already), "pending": bool(pending_req)}


# ----------------------------- Host controls: join requests + cancellation -----------------------------
async def require_host(event_id: str, user: dict):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if ev.get("created_by") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the host can do this")
    return ev


@api_router.get("/events/{event_id}/requests")
async def list_requests(event_id: str, user=Depends(get_current_user)):
    await require_host(event_id, user)
    docs = await db.join_requests.find({"event_id": event_id, "status": "pending"}).to_list(200)
    out = []
    for d in docs:
        u = await db.users.find_one(
            {"user_id": d["user_id"]},
            {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "birthdate": 1, "identity_verified": 1},
        )
        if u:
            u["requested_at"] = d.get("at")
            out.append(u)
    return {"count": len(out), "requests": out}


@api_router.post("/events/{event_id}/requests/{req_user_id}/approve")
async def approve_request(event_id: str, req_user_id: str, user=Depends(get_current_user)):
    ev = await require_host(event_id, user)
    if ev.get("status") == "cancelled":
        raise HTTPException(status_code=409, detail="Event cancelled")
    reqd = await db.join_requests.find_one({"event_id": event_id, "user_id": req_user_id, "status": "pending"})
    if not reqd:
        raise HTTPException(status_code=404, detail="Request not found")
    existing = await db.checkins.find_one({"event_id": event_id, "user_id": req_user_id})
    if not existing:
        await db.checkins.insert_one({
            "event_id": event_id, "user_id": req_user_id, "at": now_utc().isoformat(),
            "visibility": reqd.get("visibility", "public"), "at_venue": bool(reqd.get("at_venue")),
        })
        await db.events.update_one({"id": event_id}, {"$inc": {"checkins": 1}})
    await db.join_requests.delete_one({"event_id": event_id, "user_id": req_user_id})
    try:
        await notify([req_user_id], "request_approved", {"event_title": ev["title"]}, f"/chat/{event_id}",
                     event_id=event_id, actor_id=user["user_id"])
    except Exception as e:
        logger.warning(f"approve notify failed (non-blocking): {e}")
    return {"ok": True}


@api_router.post("/events/{event_id}/requests/{req_user_id}/reject")
async def reject_request(event_id: str, req_user_id: str, user=Depends(get_current_user)):
    ev = await require_host(event_id, user)
    res = await db.join_requests.delete_one({"event_id": event_id, "user_id": req_user_id})
    if res.deleted_count:
        try:
            await notify([req_user_id], "request_rejected", {"event_title": ev["title"]}, "/(tabs)/explore",
                         event_id=event_id, actor_id=user["user_id"])
        except Exception as e:
            logger.warning(f"reject notify failed (non-blocking): {e}")
    return {"ok": True}


@api_router.post("/events/{event_id}/cancel")
async def cancel_event(event_id: str, user=Depends(get_current_user)):
    ev = await require_host(event_id, user)
    if ev.get("status") == "cancelled":
        return with_live_count(await db.events.find_one({"id": event_id}, {"_id": 0}))
    await db.events.update_one({"id": event_id}, {"$set": {"status": "cancelled", "cancelled_at": now_utc().isoformat()}})
    try:
        await db.messages.insert_one({
            "id": str(uuid.uuid4()), "event_id": event_id, "user_id": "system",
            "user_name": "LocalLoop", "user_picture": "", "system": True, "system_key": "cancelled",
            "text": "\u26a0\ufe0f This event has been cancelled by the host.",
            "created_at": now_utc().isoformat(),
        })
    except Exception as e:
        logger.warning(f"cancel system msg failed (non-blocking): {e}")
    try:
        att = await db.checkins.find({"event_id": event_id}).to_list(500)
        reqs = await db.join_requests.find({"event_id": event_id, "status": "pending"}).to_list(500)
        await notify([a["user_id"] for a in att] + [r["user_id"] for r in reqs], "event_cancelled",
                     {"event_title": ev["title"]}, f"/event/{event_id}", event_id=event_id, actor_id=user["user_id"])
    except Exception as e:
        logger.warning(f"cancel notify failed (non-blocking): {e}")
    updated = await db.events.find_one({"id": event_id}, {"_id": 0})
    return with_live_count(updated)


# ----------------------------- Profile -----------------------------
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    instagram: Optional[str] = None
    picture: Optional[str] = None
    birthdate: Optional[str] = None  # ISO date YYYY-MM-DD
    account_type: Optional[str] = None  # user | business
    onboarded: Optional[bool] = None
    business_name: Optional[str] = None
    business_category: Optional[str] = None
    business_address: Optional[str] = None
    business_website: Optional[str] = None
    business_instagram: Optional[str] = None
    identity_verified: Optional[bool] = None
    selfie: Optional[str] = None
    # Registration confirmations: stored as timestamps (terms_accepted_at / truth_confirmed_at), never un-set.
    accept_terms: Optional[bool] = None  # Nutzungsbedingungen + Community-Richtlinien
    confirm_truth: Optional[bool] = None  # "Ich bestätige, dass meine Angaben der Wahrheit entsprechen"
    lang: Optional[str] = None  # de | en — language of push texts
    push_events: Optional[bool] = None  # push for requests, changes, cancellations
    push_messages: Optional[bool] = None  # push for chat messages


@api_router.get("/users/{user_id}")
async def get_public_user(user_id: str, viewer=Depends(get_optional_user)):
    u = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "bio": 1, "instagram": 1,
         "account_type": 1, "verified": 1, "identity_verified": 1, "birthdate": 1, "business_name": 1,
         "business_category": 1, "business_address": 1, "business_website": 1, "business_instagram": 1},
    )
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u["blocked"] = user_id in await blocked_ids(viewer)
    return u


@api_router.delete("/profile")
async def delete_profile(user=Depends(get_current_user)):
    uid = user["user_id"]
    # Keep the per-event check-in counters in sync with the check-ins that disappear.
    for c in await db.checkins.find({"user_id": uid}, {"_id": 0, "event_id": 1}).to_list(None):
        await db.events.update_one({"id": c["event_id"]}, {"$inc": {"checkins": -1}})
    await db.checkins.delete_many({"user_id": uid})
    await db.join_requests.delete_many({"user_id": uid})
    await db.saves.delete_many({"user_id": uid})
    await db.messages.delete_many({"user_id": uid})  # chat messages carry user_id (+ copied name/picture)
    reviewed = await db.reviews.find({"user_id": uid}, {"_id": 0, "event_id": 1}).to_list(None)
    await db.reviews.delete_many({"user_id": uid})
    for r in reviewed:
        await recompute_rating(r["event_id"])
    await db.crews.update_many({}, {"$pull": {"member_ids": uid}})
    await db.crew_suggestions.update_many({}, {"$pull": {"votes": uid}})
    # Unused deals go back to the pool; redeemed ones stay for the host's numbers but lose the link to the person.
    for d in await db.deals.find({"user_id": uid}, {"_id": 0, "id": 1, "event_id": 1, "redeemed_at": 1}).to_list(None):
        if d.get("redeemed_at"):
            await db.deals.update_one({"id": d["id"]}, {"$set": {"user_id": f"deleted_{d['id']}"}})
        else:
            await db.deals.delete_one({"id": d["id"]})
            await db.events.update_one({"id": d["event_id"]}, {"$inc": {"offer_claimed": -1}})
    await db.blocks.delete_many({"$or": [{"user_id": uid}, {"blocked_id": uid}]})
    await db.reports.delete_many({"reporter_id": uid})  # reports *about* this user stay for moderation
    await db.notifications.delete_many({"user_id": uid})
    await db.chat_hidden.delete_many({"user_id": uid})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}


@api_router.patch("/profile")
async def update_profile(payload: ProfileUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    accept_terms = updates.pop("accept_terms", False)
    confirm_truth = updates.pop("confirm_truth", False)
    for k in ("business_name", "business_address", "business_website", "business_instagram"):
        if k in updates:
            updates[k] = updates[k].strip()
    reject_bad_words({k: updates.get(k) for k in ("name", "bio", "business_name")})
    if "lang" in updates and updates["lang"] not in ("de", "en"):
        raise HTTPException(status_code=400, detail="Invalid lang")
    # The birthdate is fixed once registration is complete (age rules depend on it).
    if "birthdate" in updates and user.get("onboarded") and user.get("birthdate") and updates["birthdate"] != user["birthdate"]:
        raise HTTPException(status_code=409, detail="Birthdate can't be changed")
    if accept_terms and not user.get("terms_accepted_at"):
        updates["terms_accepted_at"] = now_utc().isoformat()
    if confirm_truth and not user.get("truth_confirmed_at"):
        updates["truth_confirmed_at"] = now_utc().isoformat()
    # Business accounts with a completed business profile are auto-verified (demo).
    merged = {**user, **updates}
    if merged.get("account_type") == "business" and "business_name" in updates and not updates["business_name"]:
        raise HTTPException(status_code=400, detail="Business name is required")
    if merged.get("account_type") == "business" and merged.get("business_name"):
        updates["verified"] = True
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})


# ----------------------------- Attendance helpers -----------------------------
async def require_attending(event_id: str, user: dict, allow_host: bool = False):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if allow_host and ev.get("created_by") == user["user_id"]:
        return ev  # hosts can always read and write in the chat of their own event
    attending = await db.checkins.find_one({"event_id": event_id, "user_id": user["user_id"]})
    if not attending:
        raise HTTPException(status_code=403, detail="Check in to join this event")
    return ev


@api_router.get("/events/{event_id}/participants")
async def participants(event_id: str, user=Depends(get_current_user)):
    docs = await db.checkins.find({"event_id": event_id}).to_list(500)
    users = []
    requester = user["user_id"]
    hidden = await blocked_ids(user)
    for d in docs:
        if d["user_id"] in hidden:  # still counted, just not shown to the person who blocked them
            continue
        vis = d.get("visibility", "public")
        visible = vis == "public" or d["user_id"] == requester
        if visible:
            u = await db.users.find_one({"user_id": d["user_id"]}, {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "birthdate": 1, "identity_verified": 1})
            if u:
                u["live"] = bool(d.get("at_venue"))
                u["anonymous"] = False
                users.append(u)
        else:
            # Anonymous / friends-only (to non-friends): counted but shown as a placeholder.
            users.append({"user_id": f"anon_{d['user_id'][:6]}", "anonymous": True, "live": bool(d.get("at_venue"))})
    return {"count": len(docs), "participants": users}


# ----------------------------- Reviews / Ratings -----------------------------
class ReviewCreate(BaseModel):
    rating: int  # 1..5
    comment: str = ""


async def recompute_rating(event_id: str):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        return
    # Freeze the seeded reputation as a baseline the first time.
    if "base_rating" not in ev:
        base_rating = float(ev.get("rating", 0) or 0)
        base_count = int(ev.get("rating_count", 0) or 0)
        await db.events.update_one({"id": event_id}, {"$set": {"base_rating": base_rating, "base_count": base_count}})
    else:
        base_rating = float(ev.get("base_rating", 0) or 0)
        base_count = int(ev.get("base_count", 0) or 0)
    reviews = await db.reviews.find({"event_id": event_id}, {"_id": 0}).to_list(1000)
    n = len(reviews)
    total = base_rating * base_count + sum(r["rating"] for r in reviews)
    count = base_count + n
    avg = round(total / count, 1) if count else 0.0
    await db.events.update_one({"id": event_id}, {"$set": {"rating": avg, "rating_count": count}})


@api_router.get("/events/{event_id}/reviews")
async def get_reviews(event_id: str):
    docs = await db.reviews.find({"event_id": event_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api_router.post("/events/{event_id}/reviews")
async def post_review(event_id: str, payload: ReviewCreate, user=Depends(get_current_user)):
    await require_attending(event_id, user)
    rating = max(1, min(5, int(payload.rating)))
    comment, _ = censor_text(payload.comment.strip()[:1000])
    review = {
        "id": str(uuid.uuid4()), "event_id": event_id, "user_id": user["user_id"],
        "user_name": user.get("name") or "Guest", "user_picture": user.get("picture") or "",
        "rating": rating, "comment": comment, "created_at": now_utc().isoformat(),
    }
    await db.reviews.update_one(
        {"event_id": event_id, "user_id": user["user_id"]},
        {"$set": review}, upsert=True,
    )
    await recompute_rating(event_id)
    return {"ok": True, "review": review}


# ----------------------------- Group Chat -----------------------------
class MessageCreate(BaseModel):
    text: str


@api_router.get("/events/{event_id}/messages")
async def get_messages(event_id: str, user=Depends(get_current_user)):
    await require_attending(event_id, user, allow_host=True)
    docs = await db.messages.find({"event_id": event_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    hidden = await blocked_ids(user)
    uid = user["user_id"]
    # Opening the chat clears its entry in the notification center.
    await db.notifications.update_many({"user_id": uid, "type": "chat", "event_id": event_id, "read_at": None},
                                       {"$set": {"read_at": now_utc().isoformat()}})
    # Messages of blocked people disappear for the blocker; messages hidden after several reports
    # disappear for everyone except their author.
    return [m for m in docs if m.get("user_id") not in hidden and (not m.get("hidden") or m.get("user_id") == uid)]


MESSAGE_MAX_LEN = 2000


@api_router.post("/events/{event_id}/messages")
async def post_message(event_id: str, payload: MessageCreate, user=Depends(get_current_user)):
    ev_doc = await require_attending(event_id, user, allow_host=True)
    if lifecycle(ev_doc) in ("past", "cancelled"):
        raise HTTPException(status_code=409, detail={"code": "chat_archived", "message": "This chat is archived"})
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty message")
    if len(text) > MESSAGE_MAX_LEN:
        raise HTTPException(status_code=400, detail=f"Message too long (max {MESSAGE_MAX_LEN})")
    text, censored = censor_text(text)
    msg = {
        "id": str(uuid.uuid4()), "event_id": event_id, "user_id": user["user_id"],
        "user_name": user.get("name") or "Guest", "user_picture": user.get("picture") or "",
        "text": text, "censored": censored, "created_at": now_utc().isoformat(),
    }
    await db.messages.insert_one(dict(msg))
    # Notify other attendees (non-blocking)
    try:
        others = await db.checkins.find({"event_id": event_id, "user_id": {"$ne": user["user_id"]}}, {"_id": 0, "user_id": 1}).to_list(500)
        await notify([o["user_id"] for o in others] + [ev_doc.get("created_by")], "chat",
                     {"user_name": msg["user_name"], "event_title": ev_doc.get("title", ""), "text": text[:120]},
                     f"/chat/{event_id}", event_id=event_id, actor_id=user["user_id"])
    except Exception as e:
        logger.warning(f"chat notify failed (non-blocking): {e}")
    return msg


# ----------------------------- Chats tab -----------------------------
def chat_state(ev: dict, now: datetime) -> str:
    """active | ended (archived: the event is over and gone from the map) | cancelled (archived)."""
    state = lifecycle(ev, now)
    return {"past": "ended", "cancelled": "cancelled"}.get(state, "active")


@api_router.get("/my/chats")
async def my_chats(user=Depends(get_current_user)):
    """Event chats of the user: events they joined + events they host. Archived ones (over / cancelled)
    stay until the user removes them; they are read-only."""
    uid = user["user_id"]
    now = now_utc()
    joined = {c["event_id"]: c for c in await db.checkins.find({"user_id": uid}, {"_id": 0}).to_list(1000)}
    hosted = await db.events.find({"created_by": uid}, {"_id": 0}).to_list(1000)
    hidden = {h["event_id"] for h in await db.chat_hidden.find({"user_id": uid}, {"_id": 0, "event_id": 1}).to_list(1000)}
    events = {e["id"]: e for e in hosted}
    others = [i for i in joined if i not in events]
    for e in await db.events.find({"id": {"$in": others}}, {"_id": 0}).to_list(1000):
        events[e["id"]] = e
    ids = [i for i in events if i not in hidden]
    members = await counts_by_event(db.checkins, {"event_id": {"$in": ids}})
    unread_rows = await db.notifications.find(
        {"user_id": uid, "type": "chat", "read_at": None, "event_id": {"$in": ids}}, {"_id": 0, "event_id": 1, "count": 1}
    ).to_list(1000)
    unread: dict = {}
    for n in unread_rows:
        unread[n["event_id"]] = unread.get(n["event_id"], 0) + int(n.get("count") or 1)
    blocked = list(await blocked_ids(user))

    out = []
    for eid in ids:
        ev = events[eid]
        last = await db.messages.find(
            {"event_id": eid, "user_id": {"$nin": blocked}, "hidden": {"$ne": True}}, {"_id": 0}
        ).sort("created_at", -1).to_list(1)
        last = last[0] if last else None
        start, end = current_window(ev, now)
        state = chat_state(ev, now)
        out.append({
            "event_id": eid, "title": ev.get("title", ""), "category": ev.get("category", ""),
            "emoji": ev.get("emoji", ""), "image_url": ev.get("image_url", ""),
            "role": "host" if ev.get("created_by") == uid else "guest",
            "state": state, "is_live": lifecycle(ev, now) == "live",
            "is_recurring": bool(ev.get("is_recurring")),
            "start_time": ev.get("start_time"), "next_occurrence": start.isoformat() if start else None,
            "ends_at": end.isoformat() if end else None, "cancelled_at": ev.get("cancelled_at"),
            "members": members.get(eid, 0), "unread": 0 if state != "active" else unread.get(eid, 0),
            "last_message": {
                "user_id": last.get("user_id"), "user_name": last.get("user_name", ""),
                "text": last.get("text", ""), "system": bool(last.get("system")), "system_key": last.get("system_key"),
                "created_at": last.get("created_at"),
            } if last else None,
            "last_activity": (last or {}).get("created_at") or (joined.get(eid) or {}).get("at") or ev.get("created_at") or "",
        })
    active = sorted((c for c in out if c["state"] == "active"), key=lambda c: c["last_activity"], reverse=True)
    archived = sorted((c for c in out if c["state"] != "active"),
                      key=lambda c: c["cancelled_at"] or c["ends_at"] or "", reverse=True)
    return active + archived


@api_router.post("/chats/{event_id}/hide")
async def hide_chat(event_id: str, user=Depends(get_current_user)):
    """Remove an archived chat from the own Chats tab (the messages stay for everybody else)."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if chat_state(ev, now_utc()) == "active":
        raise HTTPException(status_code=409, detail="Only archived chats can be removed; leave the event instead")
    uid = user["user_id"]
    await db.chat_hidden.update_one({"user_id": uid, "event_id": event_id},
                                    {"$set": {"user_id": uid, "event_id": event_id, "at": now_utc().isoformat()}}, upsert=True)
    await db.notifications.update_many({"user_id": uid, "type": "chat", "event_id": event_id, "read_at": None},
                                       {"$set": {"read_at": now_utc().isoformat()}})
    return {"ok": True}


# ----------------------------- Notification center -----------------------------
@api_router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    await ensure_reminders(user)
    uid = user["user_id"]
    items = await db.notifications.find({"user_id": uid}, {"_id": 0, "user_id": 0, "dedupe_key": 0}).sort("created_at", -1).to_list(50)
    unread = await db.notifications.count_documents({"user_id": uid, "read_at": None})
    return {"unread": unread, "items": items}


@api_router.get("/notifications/unread-count")
async def unread_notifications(user=Depends(get_current_user)):
    await ensure_reminders(user)
    return {"unread": await db.notifications.count_documents({"user_id": user["user_id"], "read_at": None})}


class ReadBody(BaseModel):
    ids: Optional[List[str]] = None  # None = all


@api_router.post("/notifications/read")
async def read_notifications(body: ReadBody = ReadBody(), user=Depends(get_current_user)):
    query: dict = {"user_id": user["user_id"], "read_at": None}
    if body.ids is not None:
        query["id"] = {"$in": body.ids}
    res = await db.notifications.update_many(query, {"$set": {"read_at": now_utc().isoformat()}})
    return {"updated": res.modified_count}


# ----------------------------- Reports & blocks (moderation) -----------------------------
REPORT_TYPES = {"user", "event", "message"}
REPORT_REASONS = {"spam", "harassment", "hate", "sexual", "violence", "fake", "other"}
AUTO_HIDE_REPORTS = 3  # a chat message reported by this many different people is hidden for everyone


class ReportBody(BaseModel):
    target_type: str  # user | event | message
    target_id: str
    reason: str
    note: str = ""


@api_router.post("/reports")
async def create_report(body: ReportBody, user=Depends(get_current_user)):
    if body.target_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid target_type")
    if body.reason not in REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Invalid reason")
    uid = user["user_id"]
    if body.target_type == "user":
        target = await db.users.find_one({"user_id": body.target_id}, {"_id": 0, "user_id": 1, "name": 1})
        owner, snapshot, event_id = body.target_id, (target or {}).get("name", ""), None
    elif body.target_type == "event":
        target = await db.events.find_one({"id": body.target_id}, {"_id": 0, "id": 1, "title": 1, "created_by": 1})
        owner, snapshot, event_id = (target or {}).get("created_by"), (target or {}).get("title", ""), body.target_id
    else:
        target = await db.messages.find_one({"id": body.target_id}, {"_id": 0})
        owner, snapshot, event_id = (target or {}).get("user_id"), (target or {}).get("text", ""), (target or {}).get("event_id")
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    if owner == uid:
        raise HTTPException(status_code=400, detail="You can't report yourself")
    await db.reports.update_one(
        {"reporter_id": uid, "target_type": body.target_type, "target_id": body.target_id},
        {"$set": {"reason": body.reason, "note": body.note.strip()[:500], "target_owner_id": owner,
                  "event_id": event_id, "snapshot": (snapshot or "")[:500], "updated_at": now_utc().isoformat()},
         "$setOnInsert": {"id": str(uuid.uuid4()), "status": "open", "created_at": now_utc().isoformat()}},
        upsert=True,
    )
    if body.target_type == "message":
        reporters = await db.reports.count_documents({"target_type": "message", "target_id": body.target_id})
        if reporters >= AUTO_HIDE_REPORTS:
            await db.messages.update_one({"id": body.target_id}, {"$set": {"hidden": True}})
    return {"ok": True}


@api_router.post("/users/{user_id}/block")
async def toggle_block(user_id: str, user=Depends(get_current_user)):
    uid = user["user_id"]
    if user_id == uid:
        raise HTTPException(status_code=400, detail="You can't block yourself")
    if not await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1}):
        raise HTTPException(status_code=404, detail="User not found")
    res = await db.blocks.delete_one({"user_id": uid, "blocked_id": user_id})
    if res.deleted_count:
        return {"blocked": False}
    try:
        await db.blocks.insert_one({"user_id": uid, "blocked_id": user_id, "at": now_utc().isoformat()})
    except DuplicateKeyError:
        pass
    return {"blocked": True}


@api_router.get("/my/blocks")
async def my_blocks(user=Depends(get_current_user)):
    ids = list(await blocked_ids(user))
    return await db.users.find(
        {"user_id": {"$in": ids}},
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "account_type": 1, "business_name": 1},
    ).to_list(None)


@api_router.get("/admin/reports")
async def admin_reports(status: str = "open", user=Depends(get_current_user)):
    """Moderation queue for the addresses listed in ADMIN_EMAILS (comma separated)."""
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
    if (user.get("email") or "").lower() not in admins:
        raise HTTPException(status_code=403, detail="Admins only")
    return await db.reports.find({"status": status}, {"_id": 0}).sort("created_at", -1).to_list(500)


# ----------------------------- Crews -----------------------------
class CrewCreate(BaseModel):
    name: str


class JoinCrew(BaseModel):
    invite_code: str


class SuggestionCreate(BaseModel):
    event_id: Optional[str] = None
    custom_text: Optional[str] = None


async def crew_detail(crew: dict, user_id: str):
    members = []
    for uid in crew.get("member_ids", []):
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "user_id": 1, "name": 1, "picture": 1})
        if u:
            members.append(u)
    sugs = await db.crew_suggestions.find({"crew_id": crew["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for s in sugs:
        s["vote_count"] = len(s.get("votes", []))
        s["voted"] = user_id in s.get("votes", [])
    sugs.sort(key=lambda x: x["vote_count"], reverse=True)
    return {**crew, "members": members, "suggestions": sugs}


@api_router.post("/crews")
async def create_crew(payload: CrewCreate, user=Depends(get_current_user)):
    crew = {
        "id": str(uuid.uuid4()), "name": payload.name.strip() or "My Crew",
        "invite_code": uuid.uuid4().hex[:6].upper(),
        "member_ids": [user["user_id"]], "created_by": user["user_id"],
        "created_at": now_utc().isoformat(),
    }
    await db.crews.insert_one(dict(crew))
    return await crew_detail(crew, user["user_id"])


@api_router.get("/crews")
async def my_crews(user=Depends(get_current_user)):
    docs = await db.crews.find({"member_ids": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for d in docs:
        d["member_count"] = len(d.get("member_ids", []))
    return docs


@api_router.get("/crews/{crew_id}")
async def get_crew(crew_id: str, user=Depends(get_current_user)):
    crew = await db.crews.find_one({"id": crew_id}, {"_id": 0})
    if not crew or user["user_id"] not in crew.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Crew not found")
    return await crew_detail(crew, user["user_id"])


@api_router.post("/crews/{crew_id}/leave")
async def leave_crew(crew_id: str, user=Depends(get_current_user)):
    await db.crews.update_one({"id": crew_id}, {"$pull": {"member_ids": user["user_id"]}})
    return {"ok": True}



@api_router.post("/crews/join")
async def join_crew(payload: JoinCrew, user=Depends(get_current_user)):
    crew = await db.crews.find_one({"invite_code": payload.invite_code.strip().upper()}, {"_id": 0})
    if not crew:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if user["user_id"] not in crew.get("member_ids", []):
        await db.crews.update_one({"id": crew["id"]}, {"$addToSet": {"member_ids": user["user_id"]}})
        crew["member_ids"].append(user["user_id"])
    return await crew_detail(crew, user["user_id"])


@api_router.post("/crews/{crew_id}/suggestions")
async def add_suggestion(crew_id: str, payload: SuggestionCreate, user=Depends(get_current_user)):
    crew = await db.crews.find_one({"id": crew_id}, {"_id": 0})
    if not crew or user["user_id"] not in crew.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Crew not found")
    event_title = None
    lat = lng = None
    if payload.event_id:
        ev = await db.events.find_one({"id": payload.event_id}, {"_id": 0})
        if ev:
            event_title = ev["title"]
            lat, lng = ev["latitude"], ev["longitude"]
    sug = {
        "id": str(uuid.uuid4()), "crew_id": crew_id,
        "event_id": payload.event_id, "event_title": event_title,
        "latitude": lat, "longitude": lng,
        "custom_text": (payload.custom_text or "").strip() or None,
        "created_by": user["user_id"], "votes": [user["user_id"]],
        "created_at": now_utc().isoformat(),
    }
    await db.crew_suggestions.insert_one(dict(sug))
    return await crew_detail(crew, user["user_id"])


@api_router.post("/crews/{crew_id}/suggestions/{sug_id}/vote")
async def vote_suggestion(crew_id: str, sug_id: str, user=Depends(get_current_user)):
    crew = await db.crews.find_one({"id": crew_id}, {"_id": 0})
    if not crew or user["user_id"] not in crew.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Crew not found")
    sug = await db.crew_suggestions.find_one({"id": sug_id}, {"_id": 0})
    if not sug:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if user["user_id"] in sug.get("votes", []):
        await db.crew_suggestions.update_one({"id": sug_id}, {"$pull": {"votes": user["user_id"]}})
    else:
        await db.crew_suggestions.update_one({"id": sug_id}, {"$addToSet": {"votes": user["user_id"]}})
    return await crew_detail(crew, user["user_id"])


# ----------------------------- Push registration + Saves -----------------------------
class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    try:
        resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
        resp.raise_for_status()
    except Exception as e:
        logger.warning(f"register-push failed (non-blocking): {e}")
    return {"status": "registered"}


@api_router.post("/events/{event_id}/save")
async def toggle_save(event_id: str, user=Depends(get_current_user)):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    existing = await db.saves.find_one({"event_id": event_id, "user_id": user["user_id"]})
    if existing:
        await db.saves.delete_one({"event_id": event_id, "user_id": user["user_id"]})
        return {"saved": False}
    await db.saves.insert_one({"event_id": event_id, "user_id": user["user_id"], "at": now_utc().isoformat()})
    # No push here any more: saved events show up as reminders in the notification center 24h before they start.
    return {"saved": True}


@api_router.get("/events/{event_id}/save-status")
async def save_status(event_id: str, user=Depends(get_current_user)):
    return {"saved": bool(await db.saves.find_one({"event_id": event_id, "user_id": user["user_id"]}))}


@api_router.get("/my/saved")
async def my_saved(user=Depends(get_current_user)):
    saves = await db.saves.find({"user_id": user["user_id"]}).to_list(500)
    ids = [s["event_id"] for s in saves]
    docs = await db.events.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    return [with_live_count(d) for d in docs]


@api_router.get("/my/attending")
async def my_attending(user=Depends(get_current_user)):
    checks = await db.checkins.find({"user_id": user["user_id"]}).to_list(500)
    ids = [c["event_id"] for c in checks]
    docs = await db.events.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    return [with_live_count(d) for d in docs]


# ----------------------------- Host dashboard -----------------------------
# Real numbers only: the simulated live_count jitter from the map is deliberately left out.
def event_phase(doc: dict, now: datetime) -> str:
    """Dashboard groups: upcoming (incl. running) | past (ended) | cancelled."""
    p = lifecycle(doc, now)
    return {"live": "upcoming", "ended": "past"}.get(p, p)


async def counts_by_event(collection, match: dict) -> dict:
    rows = await collection.aggregate([
        {"$match": match},
        {"$group": {"_id": "$event_id", "n": {"$sum": 1}}},
    ]).to_list(None)
    return {r["_id"]: r["n"] for r in rows}


@api_router.get("/my/dashboard")
async def my_dashboard(tz_offset: int = 0, user=Depends(get_current_user)):
    """Host overview for the events this user created.
    tz_offset = JS Date.getTimezoneOffset() of the viewer (Berlin summer: -120), used for the per-day chart."""
    uid = user["user_id"]
    now = now_utc()
    local = timedelta(minutes=-max(-840, min(840, tz_offset)))
    events = await db.events.find({"created_by": uid}, {"_id": 0}).to_list(500)
    by_id = {e["id"]: e for e in events}
    ids = list(by_id)
    open_ids = [e["id"] for e in events if e.get("status") != "cancelled"]

    checkins = await counts_by_event(db.checkins, {"event_id": {"$in": ids}})
    saves = await counts_by_event(db.saves, {"event_id": {"$in": ids}})
    reviews = await counts_by_event(db.reviews, {"event_id": {"$in": ids}})
    deals = await counts_by_event(db.deals, {"event_id": {"$in": ids}})
    redeemed = await counts_by_event(db.deals, {"event_id": {"$in": ids}, "redeemed_at": {"$ne": None}})

    # Open join requests (only for events that are not cancelled, only from users that still exist).
    req_docs = await db.join_requests.find(
        {"event_id": {"$in": open_ids}, "status": "pending"}, {"_id": 0}
    ).sort("at", -1).to_list(1000)
    requesters = await db.users.find(
        {"user_id": {"$in": list({r["user_id"] for r in req_docs})}},
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "birthdate": 1, "identity_verified": 1},
    ).to_list(None)
    requesters = {u["user_id"]: u for u in requesters}
    open_requests = [r for r in req_docs if r["user_id"] in requesters]
    pending: dict = {}
    for r in open_requests:
        pending[r["event_id"]] = pending.get(r["event_id"], 0) + 1

    # Check-ins per local day, last 7 days (oldest first, today last).
    today = (now + local).date()
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    window_start = datetime.combine(days[0], datetime.min.time(), tzinfo=timezone.utc) - local
    recent = await db.checkins.find(
        {"event_id": {"$in": ids}, "at": {"$gte": window_start.isoformat()}}, {"_id": 0, "at": 1}
    ).to_list(10000)
    per_day = {d: 0 for d in days}
    for c in recent:
        at = parse_iso(c.get("at"))
        if at and (at + local).date() in per_day:
            per_day[(at + local).date()] += 1

    rows = []
    for e in events:
        eid = e["id"]
        rows.append({
            "id": eid, "title": e.get("title", ""), "category": e.get("category", ""),
            "emoji": e.get("emoji", ""), "image_url": e.get("image_url", ""),
            "start_time": e.get("start_time"), "end_time": e.get("end_time", ""),
            "next_occurrence": compute_next_occurrence(e),
            "is_recurring": bool(e.get("is_recurring")), "recurrence_label": e.get("recurrence_label", ""),
            "recurrence_freq": e.get("recurrence_freq", ""), "recurrence_days": e.get("recurrence_days", []),
            "status": e.get("status", "active"), "phase": event_phase(e, now), "is_live": lifecycle(e, now) == "live",
            "capacity": int(e.get("capacity", 0) or 0), "join_approval": e.get("join_approval", "auto"),
            "rating": float(e.get("rating", 0) or 0), "rating_count": int(e.get("rating_count", 0) or 0),
            "checkins": checkins.get(eid, 0), "saves": saves.get(eid, 0),
            "reviews": reviews.get(eid, 0), "pending_requests": pending.get(eid, 0),
            "offer_title": e.get("offer_title", ""), "offer_limit": int(e.get("offer_limit", 0) or 0),
            "deals_claimed": deals.get(eid, 0), "deals_redeemed": redeemed.get(eid, 0),
        })
    far = datetime.max.replace(tzinfo=timezone.utc)
    upcoming = sorted((r for r in rows if r["phase"] == "upcoming"), key=lambda r: parse_iso(r["next_occurrence"]) or far)
    past = sorted((r for r in rows if r["phase"] == "past"), key=lambda r: parse_iso(r["start_time"]) or far, reverse=True)
    cancelled = sorted((r for r in rows if r["phase"] == "cancelled"), key=lambda r: by_id[r["id"]].get("cancelled_at") or "", reverse=True)

    requests_out = [
        {**requesters[r["user_id"]], "event_id": r["event_id"],
         "event_title": by_id[r["event_id"]].get("title", ""), "requested_at": r.get("at")}
        for r in open_requests[:50]
    ]

    latest = await db.reviews.find({"event_id": {"$in": ids}}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_reviews = [{**r, "event_title": by_id[r["event_id"]].get("title", "")} for r in latest]

    rating_count = sum(r["rating_count"] for r in rows)
    rating = round(sum(r["rating"] * r["rating_count"] for r in rows) / rating_count, 1) if rating_count else 0.0
    return {
        "totals": {
            "events": len(rows),
            "active_events": len(upcoming),
            "checkins": sum(checkins.values()),
            "checkins_7d": sum(per_day.values()),
            "saves": sum(saves.values()),
            "reviews": sum(reviews.values()),
            "pending_requests": len(open_requests),
            "rating": rating,
            "rating_count": rating_count,
            "offers": sum(1 for r in rows if r["offer_title"]),
            "deals_claimed": sum(deals.values()),
            "deals_redeemed": sum(redeemed.values()),
        },
        "checkins_by_day": [{"date": d.isoformat(), "count": per_day[d]} for d in days],
        "events": upcoming + past + cancelled,
        "requests": requests_out,
        "recent_reviews": recent_reviews,
    }


# ----------------------------- Deals (business offers) -----------------------------
# A business event can carry one offer ("10% auf Kaffee"). Attendees claim it once per event and get a
# personal code; the QR code in the app encodes DEAL_QR_PREFIX + code. The host redeems it once by scanning.
DEAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I, easy to read out loud
DEAL_QR_PREFIX = "LOCALLOOP-DEAL:"


def new_deal_code() -> str:
    rng = random.SystemRandom()
    return "".join(rng.choice(DEAL_ALPHABET) for _ in range(8))


def normalize_deal_code(raw: str) -> str:
    code = (raw or "").strip().upper()
    if code.startswith(DEAL_QR_PREFIX):
        code = code[len(DEAL_QR_PREFIX):]
    return re.sub(r"[^A-Z0-9]", "", code)


def deal_status(deal: dict, ev: Optional[dict], now: datetime) -> str:
    if deal.get("redeemed_at"):
        return "redeemed"
    if not ev or ev.get("status") == "cancelled":
        return "cancelled"
    if lifecycle(ev, now) == "past":
        return "expired"
    return "active"


def deal_view(deal: dict, ev: Optional[dict], now: datetime, host: Optional[dict] = None) -> dict:
    ev = ev or {}
    host = host or {}
    return {
        "id": deal["id"], "code": deal["code"], "qr": DEAL_QR_PREFIX + deal["code"],
        "offer_title": deal["offer_title"], "event_id": deal["event_id"],
        "event_title": ev.get("title", ""),
        "business_name": host.get("business_name") or ev.get("venue_name") or host.get("name") or "",
        "start_time": ev.get("start_time"), "next_occurrence": compute_next_occurrence(ev) if ev else None,
        "is_recurring": bool(ev.get("is_recurring")), "recurrence_label": ev.get("recurrence_label", ""),
        "claimed_at": deal["claimed_at"], "redeemed_at": deal.get("redeemed_at"),
        "status": deal_status(deal, ev, now),
    }


async def deal_host(deal_or_event_host_id: str) -> Optional[dict]:
    return await db.users.find_one(
        {"user_id": deal_or_event_host_id}, {"_id": 0, "user_id": 1, "name": 1, "business_name": 1})


@api_router.post("/events/{event_id}/deal")
async def claim_deal(event_id: str, user=Depends(get_current_user)):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if not ev.get("offer_title"):
        raise HTTPException(status_code=404, detail="This event has no offer")
    uid = user["user_id"]
    host = await deal_host(ev.get("created_by", ""))
    existing = await db.deals.find_one({"event_id": event_id, "user_id": uid}, {"_id": 0})
    if existing:  # one deal per person and event: just hand back the one they have
        return {**deal_view(existing, ev, now_utc(), host), "already": True}
    if ev.get("created_by") == uid:
        raise HTTPException(status_code=403, detail="Hosts can't claim their own offer")
    if ev.get("status") == "cancelled":
        raise HTTPException(status_code=409, detail="Event cancelled")
    if lifecycle(ev) == "past":
        raise HTTPException(status_code=409, detail="Event is over")
    if not await db.checkins.find_one({"event_id": event_id, "user_id": uid}):
        raise HTTPException(status_code=403, detail="Check in to claim this offer")

    # Reserve one deal atomically, so the limit also holds when people claim at the same moment.
    limit = int(ev.get("offer_limit", 0) or 0)
    if limit:
        res = await db.events.update_one(
            {"id": event_id, "$or": [{"offer_claimed": {"$lt": limit}}, {"offer_claimed": {"$exists": False}}]},
            {"$inc": {"offer_claimed": 1}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=409, detail="Offer sold out")
    else:
        await db.events.update_one({"id": event_id}, {"$inc": {"offer_claimed": 1}})

    for _ in range(3):
        deal = {
            "id": str(uuid.uuid4()), "code": new_deal_code(), "event_id": event_id, "user_id": uid,
            "host_id": ev.get("created_by"), "offer_title": ev["offer_title"],
            "claimed_at": now_utc().isoformat(), "redeemed_at": None,
        }
        try:
            await db.deals.insert_one(dict(deal))
            return deal_view(deal, ev, now_utc(), host)
        except DuplicateKeyError:
            existing = await db.deals.find_one({"event_id": event_id, "user_id": uid}, {"_id": 0})
            if existing:  # a parallel request by the same person won
                await db.events.update_one({"id": event_id}, {"$inc": {"offer_claimed": -1}})
                return {**deal_view(existing, ev, now_utc(), host), "already": True}
            # otherwise the random code collided: try a new one
    await db.events.update_one({"id": event_id}, {"$inc": {"offer_claimed": -1}})
    raise HTTPException(status_code=503, detail="Could not create a deal, please try again")


@api_router.get("/events/{event_id}/deal")
async def my_event_deal(event_id: str, user=Depends(get_current_user)):
    deal = await db.deals.find_one({"event_id": event_id, "user_id": user["user_id"]}, {"_id": 0})
    if not deal:
        return {"deal": None}
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    return {"deal": deal_view(deal, ev, now_utc(), await deal_host(deal["host_id"]))}


@api_router.get("/my/deals")
async def my_deals(user=Depends(get_current_user)):
    deals = await db.deals.find({"user_id": user["user_id"]}, {"_id": 0}).sort("claimed_at", -1).to_list(200)
    evs = await db.events.find({"id": {"$in": [d["event_id"] for d in deals]}}, {"_id": 0}).to_list(None)
    evs = {e["id"]: e for e in evs}
    hosts = await db.users.find(
        {"user_id": {"$in": list({d["host_id"] for d in deals})}},
        {"_id": 0, "user_id": 1, "name": 1, "business_name": 1},
    ).to_list(None)
    hosts = {h["user_id"]: h for h in hosts}
    now = now_utc()
    out = [deal_view(d, evs.get(d["event_id"]), now, hosts.get(d["host_id"])) for d in deals]
    out.sort(key=lambda d: d["status"] != "active")  # usable deals first, newest first within each group
    return out


class RedeemBody(BaseModel):
    code: str


@api_router.post("/deals/redeem")
async def redeem_deal(body: RedeemBody, user=Depends(get_current_user)):
    code = normalize_deal_code(body.code)
    deal = await db.deals.find_one({"code": code}, {"_id": 0}) if code else None
    if not deal:
        raise HTTPException(status_code=404, detail="Unknown code")
    if deal["host_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="This deal belongs to another business")
    ev = await db.events.find_one({"id": deal["event_id"]}, {"_id": 0})
    guest = await db.users.find_one({"user_id": deal["user_id"]}, {"_id": 0, "name": 1, "picture": 1}) or {}
    status = deal_status(deal, ev, now_utc())
    problem = {"reason": status, "offer_title": deal["offer_title"], "redeemed_at": deal.get("redeemed_at"),
               "guest_name": guest.get("name") or "", "event_title": (ev or {}).get("title", "")}
    if status != "active":  # tell the scanner why: redeemed / cancelled / expired
        raise HTTPException(status_code=409, detail=problem)
    redeemed_at = now_utc().isoformat()
    res = await db.deals.update_one(
        {"code": code, "redeemed_at": None}, {"$set": {"redeemed_at": redeemed_at, "redeemed_by": user["user_id"]}})
    if res.modified_count == 0:  # scanned twice at the same moment
        raise HTTPException(status_code=409, detail={**problem, "reason": "redeemed"})
    deal["redeemed_at"] = redeemed_at
    return {**deal_view(deal, ev, now_utc(), await deal_host(deal["host_id"])),
            "guest_name": guest.get("name") or "Guest", "guest_picture": guest.get("picture") or ""}


# ----------------------------- Seed -----------------------------
SEED_EVENTS = [
    {
        "title": "Neon Nights Rooftop", "category": "nightlife",
        "description": "The city's hottest rooftop party with resident DJs, skyline views and craft cocktails until sunrise.",
        "image_url": "https://images.unsplash.com/photo-1630395822970-acd6a691d97e?crop=entropy&cs=srgb&fm=jpg&q=85",
        "instagram": "neonnights.sf", "website": "https://example.com/neon", "tickets_url": "https://example.com/tickets/neon",
        "latitude": 37.7899, "longitude": -122.4014, "address": "Union Square, SF", "checkins": 62,
    },
    {
        "title": "Mission Street Food Fair", "category": "food",
        "description": "40+ local vendors, live grills and global street eats. Come hungry, leave happy.",
        "image_url": "https://images.unsplash.com/photo-1551883738-19ffa3dc4c43?crop=entropy&cs=srgb&fm=jpg&q=85",
        "instagram": "missionfoodfair", "website": "https://example.com/food", "tickets_url": "",
        "latitude": 37.7599, "longitude": -122.4148, "address": "Mission District, SF", "checkins": 38,
    },
    {
        "title": "Bay Trail Morning Run", "category": "sports",
        "description": "Community 5K along the waterfront. All paces welcome, coffee after.",
        "image_url": "https://images.unsplash.com/photo-1601564350184-9e93c13df688?crop=entropy&cs=srgb&fm=jpg&q=85",
        "instagram": "baytrailrun", "website": "", "tickets_url": "",
        "latitude": 37.8078, "longitude": -122.4177, "address": "Embarcadero, SF", "checkins": 21,
    },
    {
        "title": "Contemporary Art After Dark", "category": "culture",
        "description": "Late-night gallery opening with immersive installations, live music and wine.",
        "image_url": "https://images.unsplash.com/photo-1569783721854-33a99b4c0bae?crop=entropy&cs=srgb&fm=jpg&q=85",
        "instagram": "sfmoma", "website": "https://example.com/art", "tickets_url": "https://example.com/tickets/art",
        "latitude": 37.7857, "longitude": -122.4011, "address": "SoMa, SF", "checkins": 44,
    },
    {
        "title": "Warehouse Techno Session", "category": "nightlife",
        "description": "Underground techno, industrial vibes and an all-night lineup of local selectors.",
        "image_url": "https://images.unsplash.com/photo-1630395822970-acd6a691d97e?crop=entropy&cs=srgb&fm=jpg&q=85",
        "instagram": "warehouse.sf", "website": "", "tickets_url": "https://example.com/tickets/warehouse",
        "latitude": 37.7690, "longitude": -122.4090, "address": "Potrero Hill, SF", "checkins": 55,
    },
    {
        "title": "Taco & Tequila Sunday", "category": "food",
        "description": "Authentic tacos, agave flights and mariachi in the heart of the Mission.",
        "image_url": "https://images.unsplash.com/photo-1551883738-19ffa3dc4c43?crop=entropy&cs=srgb&fm=jpg&q=85",
        "instagram": "tacotequila", "website": "https://example.com/taco", "tickets_url": "",
        "latitude": 37.7521, "longitude": -122.4180, "address": "Valencia St, SF", "checkins": 29,
    },
    {
        "title": "Golden Gate Pickup Soccer", "category": "sports",
        "description": "Casual pickup soccer in the park. Bring water, make friends, play hard.",
        "image_url": "https://images.unsplash.com/photo-1601564350184-9e93c13df688?crop=entropy&cs=srgb&fm=jpg&q=85",
        "instagram": "ggpsoccer", "website": "", "tickets_url": "",
        "latitude": 37.7694, "longitude": -122.4862, "address": "Golden Gate Park, SF", "checkins": 17,
    },
    {
        "title": "Jazz in the Fillmore", "category": "culture",
        "description": "Intimate live jazz night honoring the Fillmore's legendary music history.",
        "image_url": "https://images.unsplash.com/photo-1569783721854-33a99b4c0bae?crop=entropy&cs=srgb&fm=jpg&q=85",
        "instagram": "fillmorejazz", "website": "https://example.com/jazz", "tickets_url": "https://example.com/tickets/jazz",
        "latitude": 37.7840, "longitude": -122.4330, "address": "Fillmore, SF", "checkins": 33,
    },
]


MOCK_ATTENDEES = [
    "Lena", "Max", "Sophie", "Jonas", "Mia", "Noah", "Emma", "Ben", "Lea", "Tim", "Anna", "Paul",
]

_COFFEE = "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?crop=entropy&cs=srgb&fm=jpg&q=85"
_ROOFTOP = "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?crop=entropy&cs=srgb&fm=jpg&q=85"
_BAR = "https://images.unsplash.com/photo-1514933651103-005eec06c04b?crop=entropy&cs=srgb&fm=jpg&q=85"
_WINE = "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?crop=entropy&cs=srgb&fm=jpg&q=85"
_REST = "https://images.unsplash.com/photo-1551883738-19ffa3dc4c43?crop=entropy&cs=srgb&fm=jpg&q=85"
_BOARD = "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?crop=entropy&cs=srgb&fm=jpg&q=85"

# Real Karlsruhe venues (verified business partners) with attached demo events.
KA_VENUES = [
    {"venue_name": "DECKZEHN (Rooftop & Beach)", "title": "Sunset Rooftop Beats & Sand", "category": "rooftop", "emoji": "🍹",
     "description": "Barfuß im Sand über den Dächern von Karlsruhe. Genieße Cocktails, Liegestühle und chillige House-Beats im 10. Stock.",
     "image_url": _ROOFTOP, "instagram": "deckzehn", "website": "https://deckzehn.de", "tickets_url": "",
     "latitude": 49.0089, "longitude": 8.4069, "address": "Zähringer Str. 69, 76133 Karlsruhe", "capacity": 120, "rating": 4.8, "rating_count": 214,
     "is_recurring": True, "recurrence_freq": "weekly", "recurrence_days": [3, 5], "recurrence_label": "Every Thursday & Saturday at 18:00", "hour": 18, "minute": 0, "in_days": 0},
    {"venue_name": "VENUS BAR", "title": "Friday Night Venus Groove", "category": "nightlife", "emoji": "🪩",
     "description": "Die perfekte Mischung aus Bar und Club für ein trendbewusstes Publikum. Cocktails, elektronische Beats und gute Vibes.",
     "image_url": _BAR, "instagram": "venusbar.ka", "website": "", "tickets_url": "",
     "latitude": 49.0093, "longitude": 8.3992, "address": "Kaiserstraße 134, 76133 Karlsruhe", "capacity": 200, "rating": 4.5, "rating_count": 168,
     "is_recurring": True, "recurrence_freq": "weekly", "recurrence_days": [4], "recurrence_label": "Every Friday at 20:00", "hour": 20, "minute": 0, "in_days": 0},
    {"venue_name": "Mama's Café • Restaurant", "title": "Acoustic Sunday & Brunch", "category": "food", "emoji": "☕",
     "description": "Enjoy a relaxed brunch accompanied by live acoustic music from local Karlsruhe students.",
     "image_url": _COFFEE, "instagram": "mamas.karlsruhe", "website": "", "tickets_url": "",
     "latitude": 49.0125, "longitude": 8.4005, "address": "Hans-Thoma-Straße 3, 76133 Karlsruhe", "capacity": 60, "rating": 4.7, "rating_count": 92,
     "is_recurring": False, "hour": 11, "minute": 0, "in_days": 2},
    {"venue_name": "drei&zwanzig", "title": "Specialty Coffee Tasting Session", "category": "food", "emoji": "☕",
     "description": "Discover different roasting profiles and get a crash course in barista latte art.",
     "image_url": _COFFEE, "instagram": "dreiundzwanzig", "website": "", "tickets_url": "",
     "latitude": 49.0105, "longitude": 8.3985, "address": "Blumenstraße 19, 76133 Karlsruhe", "capacity": 20, "rating": 4.9, "rating_count": 47,
     "is_recurring": False, "hour": 15, "minute": 0, "in_days": 1},
    {"venue_name": "Wilma Wunder", "title": "After-Work Cocktail Night", "category": "rooftop", "emoji": "🍹",
     "description": "Wind down the work or study day at Marktplatz with 2-for-1 cocktails and chill house beats.",
     "image_url": _REST, "instagram": "wilmawunder.karlsruhe", "website": "", "tickets_url": "",
     "latitude": 49.0085, "longitude": 8.4038, "address": "Karl-Friedrich-Straße 9, 76133 Karlsruhe", "capacity": 80, "rating": 4.4, "rating_count": 130,
     "is_recurring": False, "hour": 18, "minute": 30, "in_days": 1},
    {"venue_name": "Bistro Le Renard", "title": "Wine & French Cheese Pairing", "category": "food", "emoji": "🍷",
     "description": "A cozy evening exploring select regional wines paired with French bistro delicacies.",
     "image_url": _WINE, "instagram": "lerenard.ka", "website": "", "tickets_url": "",
     "latitude": 49.0080, "longitude": 8.3980, "address": "Waldstraße 60, 76133 Karlsruhe", "capacity": 30, "rating": 4.6, "rating_count": 58,
     "is_recurring": False, "hour": 19, "minute": 0, "in_days": 3},
    {"venue_name": "Café Wohnzimmer", "title": "Cozy Board Game Night", "category": "gaming", "emoji": "🎮",
     "description": "Bring your friends, grab a craft beer, and challenge others to legendary board game rounds.",
     "image_url": _BOARD, "instagram": "cafewohnzimmer", "website": "", "tickets_url": "",
     "latitude": 49.0083, "longitude": 8.4111, "address": "Zähringerstraße 72, 76133 Karlsruhe", "capacity": 40, "rating": 4.7, "rating_count": 73,
     "is_recurring": False, "hour": 19, "minute": 30, "in_days": 2},
    {"venue_name": "Fitness First Karlsruhe", "title": "Sunrise HIIT Bootcamp", "category": "sports", "emoji": "🏋️",
     "description": "Kickstart your day with a high-intensity outdoor bootcamp in the Schlossgarten. All levels welcome.",
     "image_url": "https://images.unsplash.com/photo-1601564350184-9e93c13df688?crop=entropy&cs=srgb&fm=jpg&q=85", "instagram": "fitnessfirst.ka", "website": "", "tickets_url": "",
     "latitude": 49.0135, "longitude": 8.4044, "address": "Schlossbezirk 10, 76131 Karlsruhe", "capacity": 25, "rating": 4.8, "rating_count": 61,
     "is_recurring": True, "recurrence_freq": "weekly", "recurrence_days": [1, 3], "recurrence_label": "Every Tuesday & Thursday at 07:00", "hour": 7, "minute": 0, "in_days": 1},
    {"venue_name": "ZKM | Center for Art and Media", "title": "Immersive Media Art Night", "category": "arts", "emoji": "🎨",
     "description": "Late-night access to world-class interactive installations, projections and digital art.",
     "image_url": "https://images.unsplash.com/photo-1569783721854-33a99b4c0bae?crop=entropy&cs=srgb&fm=jpg&q=85", "instagram": "zkmkarlsruhe", "website": "https://zkm.de", "tickets_url": "https://zkm.de/tickets",
     "latitude": 49.0000, "longitude": 8.3835, "address": "Lorenzstraße 19, 76135 Karlsruhe", "capacity": 150, "rating": 4.9, "rating_count": 305,
     "is_recurring": False, "hour": 20, "minute": 0, "in_days": 4},
    {"venue_name": "Perfekt Futur (Alter Schlachthof)", "title": "Founders & Tech Networking", "category": "networking", "emoji": "💼",
     "description": "Meet Karlsruhe's startup scene — founders, developers and investors over drinks and lightning talks.",
     "image_url": "https://images.unsplash.com/photo-1511578314322-379afb476865?crop=entropy&cs=srgb&fm=jpg&q=85", "instagram": "perfektfutur", "website": "", "tickets_url": "",
     "latitude": 49.0158, "longitude": 8.4225, "address": "Alter Schlachthof 39, 76131 Karlsruhe", "capacity": 90, "rating": 4.5, "rating_count": 44,
     "is_recurring": False, "hour": 18, "minute": 0, "in_days": 3},
    {"venue_name": "Substage", "title": "Indie Live Concert Night", "category": "music", "emoji": "🎵",
     "description": "Live indie and alternative bands on one of Karlsruhe's most beloved stages.",
     "image_url": "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?crop=entropy&cs=srgb&fm=jpg&q=85", "instagram": "substage.ka", "website": "https://substage.de", "tickets_url": "https://substage.de/tickets",
     "latitude": 49.0148, "longitude": 8.4210, "address": "Alter Schlachthof 19, 76131 Karlsruhe", "capacity": 300, "rating": 4.7, "rating_count": 221,
     "is_recurring": False, "hour": 21, "minute": 0, "in_days": 5},
    {"venue_name": "Turmberg Trails", "title": "Sunset Hike & Viewpoint", "category": "outdoor", "emoji": "🪵",
     "description": "Guided evening hike up the Turmberg with panoramic views over the Rhine valley.",
     "image_url": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?crop=entropy&cs=srgb&fm=jpg&q=85", "instagram": "turmberg.trails", "website": "", "tickets_url": "",
     "latitude": 48.9967, "longitude": 8.4900, "address": "Turmbergstraße, 76227 Karlsruhe", "capacity": 35, "rating": 4.8, "rating_count": 89,
     "is_recurring": False, "hour": 18, "minute": 30, "in_days": 2},
    {"venue_name": "Impact Hub Karlsruhe", "title": "UX Design Workshop", "category": "workshops", "emoji": "📚",
     "description": "Hands-on introduction to product design and prototyping with Figma. Laptops recommended.",
     "image_url": "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?crop=entropy&cs=srgb&fm=jpg&q=85", "instagram": "impacthub.ka", "website": "", "tickets_url": "",
     "latitude": 49.0091, "longitude": 8.4155, "address": "Rüppurrer Str. 4, 76137 Karlsruhe", "capacity": 22, "rating": 4.6, "rating_count": 38,
     "is_recurring": False, "hour": 17, "minute": 0, "in_days": 4},
]

SEED_MESSAGES = ["Wer ist heute dabei? 🙌", "Bin gegen 20 Uhr da!", "Freu mich drauf 🎉", "Can someone save a spot?", "See you all there!"]



@app.on_event("startup")
async def seed_and_index():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.stories.create_index("expires_at", expireAfterSeconds=0)
    await db.crews.create_index("invite_code")
    await db.deals.create_index("code", unique=True)
    await db.deals.create_index([("event_id", 1), ("user_id", 1)], unique=True)
    await db.deals.create_index("user_id")
    await db.blocks.create_index([("user_id", 1), ("blocked_id", 1)], unique=True)
    await db.reports.create_index([("reporter_id", 1), ("target_type", 1), ("target_id", 1)], unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("read_at", 1)])
    await db.chat_hidden.create_index([("user_id", 1), ("event_id", 1)], unique=True)
    SEED_VERSION = 2
    meta = await db.meta.find_one({"key": "seed_version"})
    current_version = (meta or {}).get("value", 0)
    if current_version < SEED_VERSION:
        # Re-seed demo content with the new category scheme / ratings / capacity.
        await db.events.delete_many({})
        await db.checkins.delete_many({})
        await db.messages.delete_many({})
        await db.stories.delete_many({})
        await db.saves.delete_many({})
        now = now_utc()
        # seed business owner + mock attendees
        await db.users.update_one({"user_id": "seed_business"}, {"$set": {
            "user_id": "seed_business", "email": "partners@localloop.app", "name": "LocalLoop Partners",
            "picture": "", "account_type": "business", "created_at": now.isoformat()}}, upsert=True)
        mocks = []
        for i, name in enumerate(MOCK_ATTENDEES):
            uid = f"seed_user_{i}"
            await db.users.update_one({"user_id": uid}, {"$set": {
                "user_id": uid, "email": f"{uid}@localloop.app", "name": name,
                "picture": "", "account_type": "user", "created_at": now.isoformat()}}, upsert=True)
            mocks.append((uid, name))

        for v in KA_VENUES:
            v = dict(v)
            hour = v.pop("hour"); minute = v.pop("minute"); in_days = v.pop("in_days", 1)
            st = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=in_days)
            v["banner_url"] = v["image_url"]
            ev = Event(**v, start_time=st.isoformat(), verified=True, created_by="seed_business")
            await db.events.insert_one(ev.dict())
            n = random.randint(3, 6)
            attendees = random.sample(mocks, n)
            for uid, _ in attendees:
                await db.checkins.insert_one({"event_id": ev.id, "user_id": uid, "at": now.isoformat()})
            await db.events.update_one({"id": ev.id}, {"$inc": {"checkins": n}})
            for j, (uid, name) in enumerate(random.sample(attendees, min(3, n))):
                await db.messages.insert_one({
                    "id": str(uuid.uuid4()), "event_id": ev.id, "user_id": uid,
                    "user_name": name, "user_picture": "", "text": random.choice(SEED_MESSAGES),
                    "created_at": (now + timedelta(minutes=j)).isoformat()})
        logger.info("Seeded %d Karlsruhe venues", len(KA_VENUES))
        await db.meta.update_one({"key": "seed_version"}, {"$set": {"key": "seed_version", "value": SEED_VERSION}}, upsert=True)
    await roll_demo_events(force=True)


@api_router.get("/")
async def root():
    return {"message": "LocalLoop API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
