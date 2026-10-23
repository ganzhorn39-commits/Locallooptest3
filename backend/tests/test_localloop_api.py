"""Backend API tests for LocalLoop - events + auth flows."""
import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # fall back to reading frontend/.env
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    r = session.post(f"{API}/auth/dev-session")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "session_token" in data and data["user"]["email"] == "demo@localloop.app"
    return data["session_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---- Auth ----
class TestAuth:
    def test_dev_session_returns_user_and_token(self, session):
        r = session.post(f"{API}/auth/dev-session")
        assert r.status_code == 200
        j = r.json()
        assert j["user"]["email"] == "demo@localloop.app"
        assert isinstance(j["session_token"], str) and len(j["session_token"]) > 10

    def test_auth_me_requires_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_auth_me_with_token(self, session, auth_headers):
        r = session.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == "demo@localloop.app"


# ---- Events ----
class TestEvents:
    def test_list_events_returns_seed(self, session):
        r = session.get(f"{API}/events")
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list)
        assert len(events) >= 8
        e = events[0]
        for k in ("id", "title", "category", "latitude", "longitude", "live_count", "is_hot"):
            assert k in e, f"missing {k}"
        assert isinstance(e["live_count"], int)
        assert isinstance(e["is_hot"], bool)
        cats = {ev["category"] for ev in events}
        assert cats >= {"nightlife", "food", "sports", "culture"}

    def test_filter_by_category(self, session):
        r = session.get(f"{API}/events", params={"category": "nightlife"})
        assert r.status_code == 200
        events = r.json()
        assert len(events) >= 1
        assert all(e["category"] == "nightlife" for e in events)

    def test_filter_all(self, session):
        r = session.get(f"{API}/events", params={"category": "all"})
        assert r.status_code == 200
        assert len(r.json()) >= 8

    def test_get_single_event(self, session):
        events = session.get(f"{API}/events").json()
        target = events[0]
        r = session.get(f"{API}/events/{target['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == target["id"]

    def test_get_missing_event_404(self, session):
        r = session.get(f"{API}/events/nonexistent-id")
        assert r.status_code == 404

    def test_create_event_requires_auth(self, session):
        payload = {"title": "TEST_x", "category": "food", "start_time": "2026-02-01T20:00:00Z",
                   "latitude": 37.77, "longitude": -122.4}
        r = session.post(f"{API}/events", json=payload)
        assert r.status_code == 401

    def test_create_event_and_appears_in_list(self, session, auth_headers):
        title = f"TEST_Event_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": title, "category": "culture",
            "start_time": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),  # events that are over are refused
            "description": "Test event", "image_url": "",
            "instagram": "", "website": "", "tickets_url": "",
            "latitude": 37.77, "longitude": -122.42, "address": "Test",
        }
        r = session.post(f"{API}/events", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["title"] == title
        assert created["category"] == "culture"
        assert "id" in created
        # verify list includes it
        lst = session.get(f"{API}/events").json()
        assert any(e["id"] == created["id"] for e in lst)
        # cleanup handled at end
        pytest.created_event_id = created["id"]


# ---- Checkin ----
class TestCheckin:
    def test_checkin_requires_auth(self, session):
        events = session.get(f"{API}/events").json()
        r = session.post(f"{API}/events/{events[0]['id']}/checkin")
        assert r.status_code == 401

    def test_checkin_status_requires_auth(self, session):
        events = session.get(f"{API}/events").json()
        r = session.get(f"{API}/events/{events[0]['id']}/checkin-status")
        assert r.status_code == 401

    def test_checkin_toggle_increments_and_decrements(self, session, auth_headers):
        events = session.get(f"{API}/events").json()
        ev = events[2]
        ev_id = ev["id"]
        # get baseline
        before = session.get(f"{API}/events/{ev_id}").json()["checkins"]
        # ensure not currently checked in - if it is, toggle off first
        st = session.get(f"{API}/events/{ev_id}/checkin-status", headers=auth_headers).json()
        if st["checked_in"]:
            session.post(f"{API}/events/{ev_id}/checkin", headers=auth_headers)
            before = session.get(f"{API}/events/{ev_id}").json()["checkins"]

        # toggle ON
        r1 = session.post(f"{API}/events/{ev_id}/checkin", headers=auth_headers)
        assert r1.status_code == 200
        j1 = r1.json()
        assert j1["checked_in"] is True
        assert j1["checkins"] == before + 1
        st1 = session.get(f"{API}/events/{ev_id}/checkin-status", headers=auth_headers).json()
        assert st1["checked_in"] is True

        # toggle OFF
        r2 = session.post(f"{API}/events/{ev_id}/checkin", headers=auth_headers)
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2["checked_in"] is False
        assert j2["checkins"] == before
        st2 = session.get(f"{API}/events/{ev_id}/checkin-status", headers=auth_headers).json()
        assert st2["checked_in"] is False

    def test_checkin_missing_event_404(self, session, auth_headers):
        r = session.post(f"{API}/events/bogus-id/checkin", headers=auth_headers)
        assert r.status_code == 404
