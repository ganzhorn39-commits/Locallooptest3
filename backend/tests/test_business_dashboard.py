"""Business dashboard (GET /api/my/dashboard) + host controls it relies on.
Covers:
- auth required, only the caller's own events
- event phases (upcoming / past / cancelled) and ordering
- real counts: check-ins (total + last 7 days), saves, reviews, rating
- open join requests listed for the host, approve moves them into check-ins
- cancelled events: hidden from open requests, approve -> 409
- dev-session alias (two demo users), public business profile fields, business name validation
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break
API = f"{BASE_URL}/api"
RUN = uuid.uuid4().hex[:8]


def _session(alias: str):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    return s, r.json()["user"]["user_id"]


def _event(sess, title, start, **extra):
    payload = {
        "title": title, "category": "food", "start_time": start.isoformat(),
        "latitude": 49.0089, "longitude": 8.4069, "address": "TEST", **extra,  # no "Karlsruhe": seed tests filter on it
    }
    r = sess.post(f"{API}/events", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _dash(sess, tz_offset=0):
    r = sess.get(f"{API}/my/dashboard", params={"tz_offset": tz_offset})
    assert r.status_code == 200, r.text
    return r.json()


def _row(dash, event_id):
    return next(e for e in dash["events"] if e["id"] == event_id)


@pytest.fixture(scope="module")
def host():
    s, uid = _session(f"host-{RUN}")
    r = s.patch(f"{API}/profile", json={
        "account_type": "business", "onboarded": True, "business_name": f"TEST Bar {RUN}",
        "business_category": "rooftop", "business_address": "Kaiserstraße 1, Karlsruhe",
        "business_website": "https://example.com", "business_instagram": "testbar",
    })
    assert r.status_code == 200, r.text
    assert r.json()["verified"] is True
    return s, uid


@pytest.fixture(scope="module")
def guest():
    return _session(f"guest-{RUN}")


@pytest.fixture(scope="module")
def events(host):
    s, _ = host
    now = datetime.now(timezone.utc)
    return {
        "auto": _event(s, f"TEST_Dash_Auto_{RUN}", now + timedelta(days=1)),
        "manual": _event(s, f"TEST_Dash_Manual_{RUN}", now + timedelta(days=2), join_approval="manual", capacity=10),
        "past": _event(s, f"TEST_Dash_Past_{RUN}", datetime(2020, 1, 1, 20, 0, tzinfo=timezone.utc)),
    }


class TestBusinessDashboard:
    def test_requires_auth(self):
        assert requests.get(f"{API}/my/dashboard").status_code == 401

    def test_guest_without_events_sees_empty_dashboard(self, guest, events):
        d = _dash(guest[0])
        assert d["events"] == [] and d["requests"] == [] and d["recent_reviews"] == []
        assert d["totals"]["events"] == 0 and d["totals"]["checkins"] == 0
        assert len(d["checkins_by_day"]) == 7

    def test_events_have_phases_and_order(self, host, events):
        d = _dash(host[0])
        assert [e["id"] for e in d["events"]] == [events["auto"], events["manual"], events["past"]]
        assert [e["phase"] for e in d["events"]] == ["upcoming", "upcoming", "past"]
        assert d["totals"]["events"] == 3
        assert d["totals"]["active_events"] == 2
        assert "live_count" not in d["events"][0]  # real numbers only

    def test_join_request_listed_for_host(self, host, guest, events):
        gs, guid = guest
        r = gs.post(f"{API}/events/{events['manual']}/checkin", json={"visibility": "public"})
        assert r.status_code == 200 and r.json()["pending"] is True
        d = _dash(host[0])
        assert d["totals"]["pending_requests"] == 1
        req = d["requests"][0]
        assert req["user_id"] == guid
        assert req["event_id"] == events["manual"]
        assert req["event_title"] == f"TEST_Dash_Manual_{RUN}"
        assert _row(d, events["manual"])["pending_requests"] == 1

    def test_checkins_and_saves_counted(self, host, guest, events):
        gs, _ = guest
        assert gs.post(f"{API}/events/{events['auto']}/checkin", json={"visibility": "public"}).json()["checked_in"] is True
        assert gs.post(f"{API}/events/{events['auto']}/save").json()["saved"] is True
        d = _dash(host[0])
        row = _row(d, events["auto"])
        assert row["checkins"] == 1 and row["saves"] == 1
        assert d["totals"]["checkins"] == 1
        assert d["totals"]["checkins_7d"] == 1
        assert d["totals"]["saves"] == 1
        assert d["checkins_by_day"][-1]["count"] == 1

    def test_days_follow_viewer_timezone(self, host, events):
        for tz_offset in (-120, 0, 300):
            d = _dash(host[0], tz_offset)
            local_today = (datetime.now(timezone.utc) - timedelta(minutes=tz_offset)).date()
            assert d["checkins_by_day"][-1]["date"] == local_today.isoformat()
            assert d["checkins_by_day"][0]["date"] == (local_today - timedelta(days=6)).isoformat()

    def test_approve_moves_request_into_checkins(self, host, guest, events):
        hs, _ = host
        r = hs.post(f"{API}/events/{events['manual']}/requests/{guest[1]}/approve")
        assert r.status_code == 200, r.text
        d = _dash(hs)
        assert d["totals"]["pending_requests"] == 0 and d["requests"] == []
        assert _row(d, events["manual"])["checkins"] == 1
        assert d["totals"]["checkins"] == 2

    def test_reviews_and_rating(self, host, guest, events):
        r = guest[0].post(f"{API}/events/{events['auto']}/reviews", json={"rating": 4, "comment": "TEST nice"})
        assert r.status_code == 200, r.text
        d = _dash(host[0])
        assert d["totals"]["reviews"] == 1
        assert d["totals"]["rating"] == 4.0 and d["totals"]["rating_count"] == 1
        assert d["recent_reviews"][0]["event_title"] == f"TEST_Dash_Auto_{RUN}"
        assert d["recent_reviews"][0]["comment"] == "TEST nice"

    def test_cancel_moves_event_last_and_closes_requests(self, host, events):
        hs, _ = host
        late, late_id = _session(f"late-{RUN}")
        assert late.post(f"{API}/events/{events['manual']}/checkin", json={}).json()["pending"] is True
        assert _dash(hs)["totals"]["pending_requests"] == 1
        assert hs.post(f"{API}/events/{events['manual']}/cancel").status_code == 200
        d = _dash(hs)
        assert d["events"][-1]["id"] == events["manual"]
        assert d["events"][-1]["phase"] == "cancelled"
        assert d["totals"]["active_events"] == 1
        assert d["totals"]["pending_requests"] == 0 and d["requests"] == []
        r = hs.post(f"{API}/events/{events['manual']}/requests/{late_id}/approve")
        assert r.status_code == 409

    def test_other_users_do_not_see_host_events(self, guest, events):
        assert _dash(guest[0])["events"] == []


class TestDevSessionAndProfile:
    def test_dev_session_rejects_invalid_alias(self):
        r = requests.post(f"{API}/auth/dev-session", json={"alias": "not valid!"})
        assert r.status_code == 400

    def test_dev_session_without_body_still_works(self):
        r = requests.post(f"{API}/auth/dev-session")
        assert r.status_code == 200
        assert r.json()["user"]["email"] == "demo@localloop.app"

    def test_public_profile_shows_business_details(self, host):
        r = requests.get(f"{API}/users/{host[1]}")
        assert r.status_code == 200
        u = r.json()
        assert u["business_name"] == f"TEST Bar {RUN}"
        assert u["business_category"] == "rooftop"
        assert u["business_address"] == "Kaiserstraße 1, Karlsruhe"
        assert u["business_website"] == "https://example.com"
        assert u["business_instagram"] == "testbar"

    def test_blank_business_name_rejected(self, host):
        hs, _ = host
        assert hs.patch(f"{API}/profile", json={"business_name": "   "}).status_code == 400
        assert hs.get(f"{API}/auth/me").json()["business_name"] == f"TEST Bar {RUN}"

    def test_business_fields_are_trimmed(self, host):
        hs, _ = host
        r = hs.patch(f"{API}/profile", json={"business_address": "  Waldstraße 2  "})
        assert r.status_code == 200
        assert r.json()["business_address"] == "Waldstraße 2"
