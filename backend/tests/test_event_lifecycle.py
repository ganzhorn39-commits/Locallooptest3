"""Event lifecycle: optional end time, live / ended / past phases (events leave the map 2h after their end),
recurring dates in Berlin wall-clock time (weekly / every two weeks / monthly), check-out of cancelled events,
and the Chats tab with archived (read-only, removable) chats."""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import event_time as et  # noqa: E402

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break
API = f"{BASE_URL}/api"
RUN = uuid.uuid4().hex[:8]
BERLIN = ZoneInfo("Europe/Berlin")


def now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat()


def _session(alias: str):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    s.patch(f"{API}/profile", json={"name": alias.split("-")[0].title(), "accept_terms": True})
    return s, r.json()["user"]["user_id"]


def _create(sess, title, start, **extra):
    return sess.post(f"{API}/events", json={
        "title": title, "category": "food", "start_time": start if isinstance(start, str) else iso(start),
        "latitude": 49.0, "longitude": 8.4, "address": "TEST", **extra,
    })


def _event(sess, title, start, **extra):
    r = _create(sess, title, start, **extra)
    assert r.status_code == 200, r.text
    return r.json()


def _listed(event_id):
    return any(e["id"] == event_id for e in requests.get(f"{API}/events").json())


@pytest.fixture(scope="module")
def host():
    return _session(f"lchost-{RUN}")


@pytest.fixture(scope="module")
def guest():
    return _session(f"lcguest-{RUN}")


class TestTimeRules:
    """Pure rules (no server)."""

    def test_manual_dst_rule_matches_tz_database(self):
        t = datetime(2026, 1, 1, tzinfo=timezone.utc)
        while t < datetime(2028, 1, 1, tzinfo=timezone.utc):
            assert et.to_local(t, None) == et.to_local(t, BERLIN)
            t += timedelta(hours=1)
        assert et.from_local(datetime(2026, 3, 29, 2, 30), None) == et.from_local(datetime(2026, 3, 29, 2, 30), BERLIN)

    def test_weekly_keeps_local_time_across_dst(self):
        doc = {"start_time": "2026-09-04T18:00:00+00:00", "is_recurring": True, "recurrence_days": [4]}
        starts = et.occurrence_starts(doc, datetime(2026, 10, 1, tzinfo=timezone.utc), datetime(2026, 11, 15, tzinfo=timezone.utc))
        assert [s.astimezone(BERLIN).strftime("%a %H:%M") for s in starts] == ["Fri 20:00"] * len(starts)
        assert {s.hour for s in starts} == {18, 19}  # summer and winter time in UTC

    def test_weekday_is_the_local_one(self):
        # Saturday 00:30 in Karlsruhe is still Friday in UTC
        doc = {"start_time": "2026-10-23T22:30:00+00:00", "is_recurring": True, "recurrence_days": [5]}
        starts = et.occurrence_starts(doc, datetime(2026, 10, 20, tzinfo=timezone.utc), datetime(2026, 11, 3, tzinfo=timezone.utc))
        assert [s.astimezone(BERLIN).strftime("%Y-%m-%d %a %H:%M") for s in starts] == ["2026-10-24 Sat 00:30", "2026-10-31 Sat 00:30"]

    def test_biweekly_and_monthly(self):
        window = (datetime(2026, 10, 1, tzinfo=timezone.utc), datetime(2027, 1, 1, tzinfo=timezone.utc))
        bi = {"start_time": "2026-10-09T18:00:00+00:00", "is_recurring": True, "recurrence_days": [4], "recurrence_freq": "biweekly"}
        days = [s.astimezone(BERLIN).date() for s in et.occurrence_starts(bi, *window)]
        assert days[0].isoformat() == "2026-10-09" and all((b - a).days == 14 for a, b in zip(days, days[1:]))
        monthly = {"start_time": "2026-10-23T18:00:00+00:00", "is_recurring": True, "recurrence_days": [4], "recurrence_freq": "monthly"}
        days = [s.astimezone(BERLIN).date().isoformat() for s in et.occurrence_starts(monthly, *window)]
        assert days == ["2026-10-23", "2026-11-27", "2026-12-25"]  # every 4th Friday
        last = {"start_time": "2026-10-30T18:00:00+00:00", "is_recurring": True, "recurrence_days": [4], "recurrence_freq": "monthly"}
        days = [s.astimezone(BERLIN).date().isoformat() for s in et.occurrence_starts(last, *window)]
        assert days == ["2026-10-30", "2026-11-27", "2026-12-25"]  # "5th Friday" -> last Friday of the month

    def test_phases_with_and_without_end_time(self):
        t0 = datetime(2026, 10, 23, 18, 0, tzinfo=timezone.utc)
        doc = {"start_time": iso(t0)}  # no end time: 3 hours
        assert [et.phase(doc, t0 + timedelta(hours=h)) for h in (-1, 1, 4, 5.5)] == ["upcoming", "live", "ended", "past"]
        doc = {"start_time": iso(t0), "end_time": iso(t0 + timedelta(hours=8))}
        assert [et.phase(doc, t0 + timedelta(hours=h)) for h in (7, 9, 10.5)] == ["live", "ended", "past"]
        assert et.phase({**doc, "status": "cancelled"}, t0) == "cancelled"


class TestEndTimeAndPhases:
    def test_end_time_validation(self, host):
        start = now() + timedelta(days=2)
        r = _create(host[0], f"TEST_End_{RUN}", start, end_time=iso(start - timedelta(hours=1)))
        assert r.status_code == 400 and r.json()["detail"]["code"] == "end_before_start"
        r = _create(host[0], f"TEST_End_{RUN}", start, end_time=iso(start + timedelta(days=8)))
        assert r.status_code == 400 and r.json()["detail"]["code"] == "too_long"
        assert _create(host[0], f"TEST_End_{RUN}", start, end_time="tomorrow").status_code == 400
        assert _create(host[0], f"TEST_End_{RUN}", "not a date").status_code == 400
        ev = _event(host[0], f"TEST_End_{RUN}", start, end_time=iso(start + timedelta(hours=6)))
        assert ev["phase"] == "upcoming" and ev["is_live"] is False
        assert ev["ends_at"].startswith((start + timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M"))

    def test_running_event_can_be_created_and_is_live(self, host):
        ev = _event(host[0], f"TEST_Live_{RUN}", now() - timedelta(hours=1))
        assert ev["phase"] == "live" and ev["is_live"] is True
        assert _listed(ev["id"])

    def test_event_that_is_over_cannot_be_created(self, host):
        r = _create(host[0], f"TEST_Over_{RUN}", now() - timedelta(hours=4))
        assert r.status_code == 400 and r.json()["detail"]["code"] == "event_over"

    def test_ended_event_stays_2h_then_leaves_the_map(self, host, guest):
        ev = _event(host[0], f"TEST_Ends_{RUN}", now() - timedelta(hours=1))
        # ended 1h ago (3h default) -> still listed, but nobody can join anymore
        r = host[0].patch(f"{API}/events/{ev['id']}", json={"start_time": iso(now() - timedelta(hours=4))})
        assert r.status_code == 200 and r.json()["phase"] == "ended"
        assert _listed(ev["id"])
        r = guest[0].post(f"{API}/events/{ev['id']}/checkin", json={})
        assert r.status_code == 409 and "over" in r.text
        # ended 3h ago -> gone from map and lists, the page itself still works
        host[0].patch(f"{API}/events/{ev['id']}", json={"start_time": iso(now() - timedelta(hours=6))})
        assert not _listed(ev["id"])
        assert requests.get(f"{API}/events/{ev['id']}").json()["phase"] == "past"

    def test_end_time_moves_the_hiding_time(self, host):
        ev = _event(host[0], f"TEST_Long_{RUN}", now() - timedelta(hours=1), end_time=iso(now() + timedelta(hours=1)))
        host[0].patch(f"{API}/events/{ev['id']}", json={"start_time": iso(now() - timedelta(hours=6)), "end_time": iso(now() - timedelta(hours=1))})
        assert _listed(ev["id"])  # ended 1h ago
        r = host[0].patch(f"{API}/events/{ev['id']}", json={"end_time": iso(now() - timedelta(hours=3))})
        assert r.status_code == 200 and r.json()["phase"] == "past"
        assert not _listed(ev["id"])
        r = host[0].patch(f"{API}/events/{ev['id']}", json={"end_time": iso(now() - timedelta(hours=7))})
        assert r.status_code == 400  # before the start
        r = host[0].patch(f"{API}/events/{ev['id']}", json={"end_time": ""})  # removing it -> 3h default
        assert r.status_code == 200 and r.json()["end_time"] == ""

    def test_dashboard_groups_ended_events_as_past(self, host):
        ev = _event(host[0], f"TEST_Dash_{RUN}", now() - timedelta(hours=1))
        host[0].patch(f"{API}/events/{ev['id']}", json={"start_time": iso(now() - timedelta(hours=4))})
        rows = {r["id"]: r for r in host[0].get(f"{API}/my/dashboard").json()["events"]}
        assert rows[ev["id"]]["phase"] == "past"


class TestRecurring:
    def test_running_occurrence_is_live_and_listed(self, host):
        local_start = et.to_local(now() - timedelta(hours=1), BERLIN)
        base = et.from_local(local_start - timedelta(days=14), BERLIN)  # started two weeks ago, same wall-clock time
        ev = _event(host[0], f"TEST_Weekly_{RUN}", base, is_recurring=True, recurrence_freq="weekly",
                    recurrence_days=[local_start.weekday()], recurrence_label="Every week")
        assert ev["phase"] == "live" and ev["is_live"] is True
        nxt = et.parse_iso(ev["next_occurrence"])
        assert abs((nxt - (now() - timedelta(hours=1))).total_seconds()) < 120  # today's date, not next week's
        occ = [et.parse_iso(o) for o in ev["occurrences"]]
        assert occ[0] == nxt and all((b - a) >= timedelta(days=6, hours=22) for a, b in zip(occ, occ[1:]))
        assert all(o.astimezone(BERLIN).strftime("%H:%M") == local_start.strftime("%H:%M") for o in occ)
        assert _listed(ev["id"])

    def test_dates_never_before_the_first_date(self, host):
        first = now() + timedelta(days=10)
        wd = et.to_local(first, BERLIN).weekday()
        ev = _event(host[0], f"TEST_Later_{RUN}", first, is_recurring=True, recurrence_days=[wd], recurrence_label="Every week")
        assert et.parse_iso(ev["next_occurrence"]) >= first - timedelta(minutes=1)
        assert ev["phase"] == "upcoming"


@pytest.fixture(scope="module")
def setup(host, guest):
    """Guest joined three events: one still on, one cancelled, one over (moved into the past by the host)."""
    (h, _), (g, _) = host, guest
    active = _event(h, f"TEST_ChatActive_{RUN}", now() + timedelta(days=1))["id"]
    cancelled = _event(h, f"TEST_ChatCancelled_{RUN}", now() + timedelta(days=2))["id"]
    ended = _event(h, f"TEST_ChatEnded_{RUN}", now() - timedelta(hours=1))["id"]
    for eid in (active, cancelled, ended):
        assert g.post(f"{API}/events/{eid}/checkin", json={}).json()["checked_in"] is True
    assert h.post(f"{API}/events/{ended}/messages", json={"text": "Danke fürs Kommen!"}).status_code == 200
    assert g.post(f"{API}/events/{active}/messages", json={"text": "Bin dabei"}).status_code == 200
    assert h.post(f"{API}/events/{active}/messages", json={"text": "Super, bis morgen"}).status_code == 200
    assert h.post(f"{API}/events/{cancelled}/cancel").status_code == 200
    h.patch(f"{API}/events/{ended}", json={"start_time": iso(now() - timedelta(hours=6))})
    return {"active": active, "cancelled": cancelled, "ended": ended}


class TestChats:
    def test_guest_sees_active_first_then_archive(self, guest, setup):
        chats = guest[0].get(f"{API}/my/chats").json()
        mine = [c for c in chats if c["event_id"] in setup.values()]
        assert [c["event_id"] for c in mine][0] == setup["active"]
        states = {c["event_id"]: c["state"] for c in mine}
        assert states == {setup["active"]: "active", setup["cancelled"]: "cancelled", setup["ended"]: "ended"}
        active = mine[0]
        assert active["role"] == "guest" and active["members"] == 1
        assert active["last_message"]["text"] == "Super, bis morgen" and active["unread"] == 1
        idx = {c["event_id"]: i for i, c in enumerate(chats)}
        assert idx[setup["active"]] < idx[setup["cancelled"]] and idx[setup["active"]] < idx[setup["ended"]]

    def test_host_sees_own_event_chats(self, host, setup):
        chats = {c["event_id"]: c for c in host[0].get(f"{API}/my/chats").json()}
        assert all(chats[eid]["role"] == "host" for eid in setup.values())
        # moving the event into the past posted the "time changed" notice after the host's message
        assert chats[setup["ended"]]["last_message"]["system_key"] == "updated_time"

    def test_opening_a_chat_clears_its_unread_count(self, guest, setup):
        guest[0].get(f"{API}/events/{setup['active']}/messages")
        chats = {c["event_id"]: c for c in guest[0].get(f"{API}/my/chats").json()}
        assert chats[setup["active"]]["unread"] == 0

    def test_archived_chats_are_read_only(self, host, guest, setup):
        for eid in (setup["ended"], setup["cancelled"]):
            r = guest[0].post(f"{API}/events/{eid}/messages", json={"text": "Hallo?"})
            assert r.status_code == 409 and r.json()["detail"]["code"] == "chat_archived"
            assert host[0].post(f"{API}/events/{eid}/messages", json={"text": "Hallo?"}).status_code == 409
            assert guest[0].get(f"{API}/events/{eid}/messages").status_code == 200

    def test_leaving_a_cancelled_event_works(self, guest, setup):
        r = guest[0].post(f"{API}/events/{setup['cancelled']}/checkin", json={})
        assert r.status_code == 200 and r.json()["checked_in"] is False
        r = guest[0].post(f"{API}/events/{setup['cancelled']}/checkin", json={})
        assert r.status_code == 409  # but nobody can join it again

    def test_remove_archived_chat(self, host, guest, setup):
        assert guest[0].post(f"{API}/chats/{setup['active']}/hide").status_code == 409
        assert guest[0].post(f"{API}/chats/{setup['ended']}/hide").status_code == 200
        ids = [c["event_id"] for c in guest[0].get(f"{API}/my/chats").json()]
        assert setup["ended"] not in ids and setup["active"] in ids
        assert setup["ended"] in [c["event_id"] for c in host[0].get(f"{API}/my/chats").json()]  # only gone for the guest
        assert guest[0].post(f"{API}/chats/does-not-exist/hide").status_code == 404
        assert requests.get(f"{API}/my/chats").status_code == 401
