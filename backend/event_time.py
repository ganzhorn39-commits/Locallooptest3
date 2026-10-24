"""When an event happens: occurrences of recurring events, end times and the live / past phases.

Recurring events repeat at the same local wall-clock time (Europe/Berlin): a weekly 20:00 event stays
at 20:00 across daylight-saving changes, and the chosen weekdays are local weekdays.
"""
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional, Tuple

DEFAULT_DURATION = timedelta(hours=3)  # events without an end time are assumed to last 3 hours
HIDE_AFTER_END = timedelta(hours=2)  # one-off events leave the map and the lists 2 hours after their end
MAX_DURATION = timedelta(days=7)
OCCURRENCE_HORIZON = timedelta(days=60)  # how far ahead the dates of recurring events are listed (date filter)

try:
    from zoneinfo import ZoneInfo

    LOCAL_TZ = ZoneInfo("Europe/Berlin")
except Exception:  # no tz database on the server: the EU summer-time rule below gives the same result
    LOCAL_TZ = None


def parse_iso(value) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _last_sunday(year: int, month: int) -> datetime:
    d = datetime(year, month, 31, 1, tzinfo=timezone.utc)  # March/October have 31 days; clocks change at 01:00 UTC
    return d - timedelta(days=(d.weekday() + 1) % 7)


def eu_offset(dt_utc: datetime) -> timedelta:
    """Germany: UTC+2 from the last Sunday of March to the last Sunday of October, otherwise UTC+1."""
    dt_utc = dt_utc.astimezone(timezone.utc)
    start, end = _last_sunday(dt_utc.year, 3), _last_sunday(dt_utc.year, 10)
    return timedelta(hours=2) if start <= dt_utc < end else timedelta(hours=1)


def to_local(dt: datetime, tz=LOCAL_TZ) -> datetime:
    """Aware datetime -> naive local wall-clock time."""
    dt = dt.astimezone(timezone.utc)
    if tz is not None:
        return dt.astimezone(tz).replace(tzinfo=None)
    return (dt + eu_offset(dt)).replace(tzinfo=None)


def from_local(naive: datetime, tz=LOCAL_TZ) -> datetime:
    """Naive local wall-clock time -> aware UTC. A time that does not exist (spring forward) moves on by an hour."""
    if tz is not None:
        return naive.replace(tzinfo=tz).astimezone(timezone.utc)
    for off in (timedelta(hours=2), timedelta(hours=1)):
        cand = (naive - off).replace(tzinfo=timezone.utc)
        if eu_offset(cand) == off:
            return cand
    return (naive - timedelta(hours=1)).replace(tzinfo=timezone.utc)


def duration(doc: dict) -> timedelta:
    start, end = parse_iso(doc.get("start_time")), parse_iso(doc.get("end_time"))
    if start and end and timedelta(0) < end - start <= MAX_DURATION:
        return end - start
    return DEFAULT_DURATION


def recurrence_days(doc: dict) -> set:
    days = set()
    for d in doc.get("recurrence_days") or []:
        try:
            d = int(d)
        except (TypeError, ValueError):
            continue
        if 0 <= d <= 6:
            days.add(d)
    return days


def is_recurring(doc: dict) -> bool:
    return bool(doc.get("is_recurring")) and bool(recurrence_days(doc))


def _repeats_on(freq: str, first: date, day: date) -> bool:
    if freq == "biweekly":  # every other week, counted from the week of the first date
        weeks = ((day - timedelta(days=day.weekday())) - (first - timedelta(days=first.weekday()))).days // 7
        return weeks % 2 == 0
    if freq == "monthly":  # the same week of the month as the first date, e.g. "every 2nd Friday"
        nth = (first.day - 1) // 7
        if nth >= 4:  # a "5th" weekday does not exist in every month: use the last one instead
            return (day + timedelta(days=7)).month != day.month
        return (day.day - 1) // 7 == nth
    return True  # weekly


def occurrence_starts(doc: dict, start_utc: datetime, end_utc: datetime, tz=LOCAL_TZ) -> List[datetime]:
    """Starts (UTC) of a recurring event within [start_utc, end_utc), never before its first date."""
    base = parse_iso(doc.get("start_time"))
    days = recurrence_days(doc)
    if not base or not days:
        return []
    base_local = to_local(base, tz)
    freq = doc.get("recurrence_freq") or "weekly"
    out = []
    day = max(to_local(start_utc, tz).date() - timedelta(days=1), base_local.date())
    last = to_local(end_utc, tz).date() + timedelta(days=1)
    while day <= last:
        if day.weekday() in days and _repeats_on(freq, base_local.date(), day):
            s = from_local(datetime.combine(day, base_local.time()), tz)
            if start_utc <= s < end_utc:
                out.append(s)
        day += timedelta(days=1)
    return out


def current_window(doc: dict, now: datetime) -> Tuple[Optional[datetime], Optional[datetime]]:
    """(start, end) of the occurrence that matters now. Recurring events: the running one, else the next one."""
    dur = duration(doc)
    if is_recurring(doc):
        for s in occurrence_starts(doc, now - dur, now + timedelta(days=70)):
            if s + dur > now:
                return s, s + dur
    start = parse_iso(doc.get("start_time"))
    return (start, start + dur) if start else (None, None)


def phase(doc: dict, now: datetime) -> str:
    """cancelled | upcoming | live | ended (over, still listed for HIDE_AFTER_END) | past (gone from map and lists)."""
    if doc.get("status") in ("cancelled", "removed"):  # removed = taken down by moderation
        return "cancelled"
    start, end = current_window(doc, now)
    if not start or now < start:
        return "upcoming"
    if now < end:
        return "live"
    if is_recurring(doc):
        return "upcoming"
    return "ended" if now < end + HIDE_AFTER_END else "past"


def upcoming_starts(doc: dict, now: datetime) -> List[str]:
    """The running and the coming dates of a recurring event (the app filters by date with them)."""
    if not is_recurring(doc):
        return []
    dur = duration(doc)
    return [s.isoformat() for s in occurrence_starts(doc, now - dur, now + OCCURRENCE_HORIZON) if s + dur > now]
