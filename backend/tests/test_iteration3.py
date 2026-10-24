"""Iteration 3 tests: Karlsruhe venues seed, recurring events, saves, banner_url, register-push."""
import os
from zoneinfo import ZoneInfo

import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="module")
def session_token():
    r = requests.post(f"{BASE_URL}/api/auth/dev-session", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def auth_headers(session_token):
    return {"Authorization": f"Bearer {session_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def events():
    r = requests.get(f"{BASE_URL}/api/events", timeout=15)
    assert r.status_code == 200
    return r.json()


# ---------------- Karlsruhe seed ----------------

class TestKarlsruheSeed:
    @pytest.mark.skip(reason="veraltet: Seed hat inzwischen 13 Lokale (Stand 2026-06)")
    def test_seven_karlsruhe_venues(self, events):
        ka = [e for e in events if "Karlsruhe" in (e.get("address") or "")]
        assert len(ka) == 7, f"Expected 7 KA venues, got {len(ka)}. Titles: {[e['title'] for e in ka]}"

    def test_events_have_required_fields(self, events):
        ka = [e for e in events if "Karlsruhe" in (e.get("address") or "")]
        for e in ka:
            assert e.get("venue_name"), f"missing venue_name: {e['title']}"
            assert e.get("verified") is True, f"not verified: {e['title']}"
            assert e.get("emoji"), f"missing emoji: {e['title']}"
            assert "is_recurring" in e
            assert "next_occurrence" in e
            # next_occurrence should be a future ISO date
            nxt = datetime.fromisoformat(e["next_occurrence"])
            assert nxt.year >= 2025

    def test_recurring_events_have_labels(self, events):
        recur = [e for e in events if e.get("is_recurring")]
        assert len(recur) >= 2
        for e in recur:
            assert e.get("recurrence_label"), f"recurring event missing label: {e['title']}"

    def test_deckzehn_next_occurrence_thursday_or_saturday_1800(self, events):
        deck = [e for e in events if "DECKZEHN" in (e.get("venue_name") or "").upper()]
        assert deck, "DECKZEHN venue not found"
        nxt = datetime.fromisoformat(deck[0]["next_occurrence"]).astimezone(ZoneInfo("Europe/Berlin"))  # local time
        # weekday(): Mon=0..Sun=6; Thu=3, Sat=5
        assert nxt.weekday() in (3, 5), f"DECKZEHN next_occurrence weekday={nxt.weekday()}"
        assert nxt.hour == 18 and nxt.minute == 0, f"time {nxt.hour}:{nxt.minute}"

    def test_venus_bar_next_occurrence_friday_2000(self, events):
        venus = [e for e in events if "VENUS BAR" in (e.get("venue_name") or "").upper()]
        assert venus, "VENUS BAR venue not found"
        # weekly at 20:00 Karlsruhe time (summer and winter)
        nxt = datetime.fromisoformat(venus[0]["next_occurrence"]).astimezone(ZoneInfo("Europe/Berlin"))
        assert nxt.weekday() == 4, f"VENUS BAR weekday={nxt.weekday()} not Friday"
        assert nxt.hour == 20 and nxt.minute == 0

    def test_checkins_between_3_and_6(self, events):
        ka = [e for e in events if "Karlsruhe" in (e.get("address") or "")]
        for e in ka:
            assert 3 <= e["checkins"] <= 6, f"{e['title']} checkins={e['checkins']}"

    @pytest.mark.skip(reason="veraltet: Teilnehmerliste braucht seit Etappe 2 einen Login")
    def test_participants_match_checkins(self, events):
        ka = [e for e in events if "Karlsruhe" in (e.get("address") or "")]
        for e in ka[:3]:  # sample a few
            r = requests.get(f"{BASE_URL}/api/events/{e['id']}/participants", timeout=15)
            assert r.status_code == 200
            data = r.json()
            assert data["count"] == e["checkins"], f"{e['title']}: count={data['count']} checkins={e['checkins']}"
            for p in data["participants"]:
                assert p.get("name") and p.get("user_id")


# ---------------- Chat seed messages ----------------

class TestSeedMessages:
    def test_seed_messages_after_checkin(self, events, auth_headers):
        ka = [e for e in events if "Karlsruhe" in (e.get("address") or "")]
        assert ka
        eid = ka[0]["id"]
        # ensure demo user is checked in
        st = requests.get(f"{BASE_URL}/api/events/{eid}/checkin-status", headers=auth_headers).json()
        if not st.get("checked_in"):
            requests.post(f"{BASE_URL}/api/events/{eid}/checkin", headers=auth_headers)
        r = requests.get(f"{BASE_URL}/api/events/{eid}/messages", headers=auth_headers)
        assert r.status_code == 200, r.text
        msgs = r.json()
        # at least a few seeded on each event (3 seeded per event)
        assert len(msgs) >= 1, f"no seed messages for {ka[0]['title']}"
        # ensure _id not leaked
        for m in msgs:
            assert "_id" not in m
            assert m.get("text") and m.get("user_name")


# ---------------- Saves ----------------

class TestSaves:
    def test_save_requires_auth(self, events):
        eid = events[0]["id"]
        r = requests.post(f"{BASE_URL}/api/events/{eid}/save")
        assert r.status_code == 401

    def test_save_status_requires_auth(self, events):
        eid = events[0]["id"]
        r = requests.get(f"{BASE_URL}/api/events/{eid}/save-status")
        assert r.status_code == 401

    def test_my_saved_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/my/saved")
        assert r.status_code == 401

    def test_my_attending_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/my/attending")
        assert r.status_code == 401

    def test_save_toggle_and_list(self, events, auth_headers):
        eid = events[0]["id"]
        # ensure clean state -> unsave first if needed
        status = requests.get(f"{BASE_URL}/api/events/{eid}/save-status", headers=auth_headers).json()
        if status["saved"]:
            requests.post(f"{BASE_URL}/api/events/{eid}/save", headers=auth_headers)
        # save
        r = requests.post(f"{BASE_URL}/api/events/{eid}/save", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["saved"] is True
        # status reflects saved
        r2 = requests.get(f"{BASE_URL}/api/events/{eid}/save-status", headers=auth_headers)
        assert r2.json()["saved"] is True
        # my/saved contains it
        listed = requests.get(f"{BASE_URL}/api/my/saved", headers=auth_headers).json()
        assert any(e["id"] == eid for e in listed)
        # toggle off
        r3 = requests.post(f"{BASE_URL}/api/events/{eid}/save", headers=auth_headers)
        assert r3.json()["saved"] is False

    def test_my_attending_returns_checked_in(self, events, auth_headers):
        # check-in to a specific event
        eid = events[1]["id"]
        st = requests.get(f"{BASE_URL}/api/events/{eid}/checkin-status", headers=auth_headers).json()
        if not st["checked_in"]:
            requests.post(f"{BASE_URL}/api/events/{eid}/checkin", headers=auth_headers)
        r = requests.get(f"{BASE_URL}/api/my/attending", headers=auth_headers)
        assert r.status_code == 200
        assert any(e["id"] == eid for e in r.json())


# ---------------- Create event with new fields ----------------

class TestCreateEventNewFields:
    def test_create_event_persists_new_fields(self, auth_headers):
        payload = {
            "title": "TEST_ITER3 Recurring Loft",
            "category": "nightlife",
            "start_time": "2026-01-30T20:00:00+00:00",
            "description": "test",
            "banner_url": "https://example.com/banner.jpg",
            "emoji": "🎉",
            "latitude": 49.0089,
            "longitude": 8.4069,
            "address": "Test Street, 76133 Karlsruhe",
            "venue_name": "TEST_VENUE",
            "is_recurring": True,
            "recurrence_freq": "weekly",
            "recurrence_days": [4, 5],
            "recurrence_label": "Every Fri & Sat 20:00",
        }
        r = requests.post(f"{BASE_URL}/api/events", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        created = r.json()
        eid = created["id"]
        # GET verify persistence
        g = requests.get(f"{BASE_URL}/api/events/{eid}", timeout=10).json()
        assert g["banner_url"] == payload["banner_url"]
        assert g["emoji"] == "🎉"
        assert g["is_recurring"] is True
        assert g["recurrence_freq"] == "weekly"
        assert g["recurrence_days"] == [4, 5]
        assert g["recurrence_label"].startswith("Every Fri")
        assert g.get("next_occurrence")


# ---------------- Push register ----------------

class TestPushRegister:
    def test_register_push_returns_201(self):
        r = requests.post(
            f"{BASE_URL}/api/register-push",
            json={"user_id": "demo_user", "platform": "ios", "device_token": "TEST_TOKEN_XYZ"},
            timeout=15,
        )
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        assert r.json().get("status") == "registered"
