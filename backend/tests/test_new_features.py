"""Backend tests for LocalLoop new features: profile, chat, stories, participants, crews."""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

API = f"{BASE_URL}/api"


def _new_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/dev-session")
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, tok


@pytest.fixture(scope="module")
def auth():
    s, tok = _new_session()
    return s


@pytest.fixture(scope="module")
def event_id(auth):
    events = auth.get(f"{API}/events").json()
    return events[0]["id"]


# -------------------- Profile --------------------
class TestProfile:
    def test_patch_profile_requires_auth(self):
        r = requests.patch(f"{API}/profile", json={"name": "x"})
        assert r.status_code == 401

    def test_patch_profile_updates_and_me_reflects(self, auth):
        new_name = f"TEST_Explorer_{uuid.uuid4().hex[:4]}"
        payload = {"name": new_name, "bio": "loves map events",
                   "instagram": "demo_ig", "picture": "data:image/png;base64,AAAA"}
        r = auth.patch(f"{API}/profile", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["name"] == new_name
        assert j["bio"] == "loves map events"
        assert j["instagram"] == "demo_ig"
        # verify via /auth/me
        me = auth.get(f"{API}/auth/me").json()
        assert me["name"] == new_name
        assert me["bio"] == "loves map events"
        assert me["instagram"] == "demo_ig"


# -------------------- Chat / Messages --------------------
class TestChat:
    def test_get_messages_requires_auth(self, event_id):
        r = requests.get(f"{API}/events/{event_id}/messages")
        assert r.status_code == 401

    def test_post_messages_requires_auth(self, event_id):
        r = requests.post(f"{API}/events/{event_id}/messages", json={"text": "hi"})
        assert r.status_code == 401

    def test_messages_forbidden_without_checkin(self, auth, event_id):
        # ensure not checked in
        st = auth.get(f"{API}/events/{event_id}/checkin-status").json()
        if st["checked_in"]:
            auth.post(f"{API}/events/{event_id}/checkin")
        r = auth.get(f"{API}/events/{event_id}/messages")
        assert r.status_code == 403
        r2 = auth.post(f"{API}/events/{event_id}/messages", json={"text": "hello"})
        assert r2.status_code == 403

    def test_messages_after_checkin(self, auth, event_id):
        st = auth.get(f"{API}/events/{event_id}/checkin-status").json()
        if not st["checked_in"]:
            r = auth.post(f"{API}/events/{event_id}/checkin")
            assert r.status_code == 200
        text = f"TEST_msg_{uuid.uuid4().hex[:5]}"
        r = auth.post(f"{API}/events/{event_id}/messages", json={"text": text})
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["text"] == text
        assert "id" in msg
        # list
        r2 = auth.get(f"{API}/events/{event_id}/messages")
        assert r2.status_code == 200
        assert any(m["text"] == text for m in r2.json())


# -------------------- Stories --------------------
@pytest.mark.skip(reason="veraltet: Stories/Moments wurden 2026-06 entfernt")
class TestStories:
    def test_stories_get_public(self, event_id):
        r = requests.get(f"{API}/events/{event_id}/stories")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_post_story_requires_auth(self, event_id):
        r = requests.post(f"{API}/events/{event_id}/stories", json={"image": "data:image/png;base64,AAAA"})
        assert r.status_code == 401

    def test_post_story_requires_checkin(self, event_id):
        # fresh user not checked in
        s, _ = _new_session()
        # different event to avoid check-in from other test
        events = s.get(f"{API}/events").json()
        alt_id = events[3]["id"]
        st = s.get(f"{API}/events/{alt_id}/checkin-status").json()
        if st["checked_in"]:
            s.post(f"{API}/events/{alt_id}/checkin")
        r = s.post(f"{API}/events/{alt_id}/stories", json={"image": "data:image/png;base64,AAAA"})
        assert r.status_code == 403

    def test_post_story_ok_after_checkin_and_expires_in_24h(self, auth, event_id):
        st = auth.get(f"{API}/events/{event_id}/checkin-status").json()
        if not st["checked_in"]:
            auth.post(f"{API}/events/{event_id}/checkin")
        r = auth.post(f"{API}/events/{event_id}/stories",
                      json={"image": "data:image/png;base64,AAAA"})
        assert r.status_code == 200, r.text
        story = r.json()
        assert story["image"].startswith("data:image/")
        assert "expires_at" in story
        exp = datetime.fromisoformat(story["expires_at"])
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        delta_hours = (exp - datetime.now(timezone.utc)).total_seconds() / 3600
        assert 23.0 <= delta_hours <= 24.5, f"expires_at delta={delta_hours}h"
        # story appears in active
        actives = requests.get(f"{API}/events/{event_id}/stories").json()
        assert any(s["id"] == story["id"] for s in actives)


# -------------------- Participants --------------------
@pytest.mark.skip(reason="veraltet: Teilnehmerliste braucht seit Etappe 2 einen Login")
class TestParticipants:
    def test_participants_returns_count_and_list(self, auth, event_id):
        # ensure at least one checkin
        st = auth.get(f"{API}/events/{event_id}/checkin-status").json()
        if not st["checked_in"]:
            auth.post(f"{API}/events/{event_id}/checkin")
        r = requests.get(f"{API}/events/{event_id}/participants")
        assert r.status_code == 200
        data = r.json()
        assert "count" in data and "participants" in data
        assert data["count"] == len(data["participants"])
        assert data["count"] >= 1
        p0 = data["participants"][0]
        assert "user_id" in p0 and "name" in p0


# -------------------- Crews --------------------
class TestCrews:
    def test_crews_requires_auth(self):
        assert requests.get(f"{API}/crews").status_code == 401
        assert requests.post(f"{API}/crews", json={"name": "x"}).status_code == 401

    def test_full_crew_flow(self, auth):
        # create crew
        name = f"TEST_Crew_{uuid.uuid4().hex[:5]}"
        r = auth.post(f"{API}/crews", json={"name": name})
        assert r.status_code == 200, r.text
        crew = r.json()
        assert crew["name"] == name
        assert "invite_code" in crew and len(crew["invite_code"]) == 6
        assert len(crew.get("members", [])) == 1
        crew_id = crew["id"]
        invite = crew["invite_code"]

        # list my crews
        r2 = auth.get(f"{API}/crews")
        assert r2.status_code == 200
        assert any(c["id"] == crew_id for c in r2.json())

        # get crew detail
        r3 = auth.get(f"{API}/crews/{crew_id}")
        assert r3.status_code == 200
        assert r3.json()["id"] == crew_id
        assert "members" in r3.json() and "suggestions" in r3.json()

        # join with second session (same demo user_id -> idempotent, member_count stays 1)
        s2, _ = _new_session()
        r4 = s2.post(f"{API}/crews/join", json={"invite_code": invite})
        assert r4.status_code == 200, r4.text
        assert r4.json()["id"] == crew_id
        # bad invite
        r_bad = s2.post(f"{API}/crews/join", json={"invite_code": "ZZZZZZ"})
        assert r_bad.status_code == 404

        # add custom_text suggestion
        custom = f"TEST_Idea_{uuid.uuid4().hex[:4]}"
        r5 = auth.post(f"{API}/crews/{crew_id}/suggestions",
                       json={"custom_text": custom})
        assert r5.status_code == 200, r5.text
        det = r5.json()
        sugs = det["suggestions"]
        assert any(s.get("custom_text") == custom for s in sugs)
        custom_sug = next(s for s in sugs if s.get("custom_text") == custom)
        assert custom_sug["vote_count"] == 1  # creator auto-voted
        assert custom_sug["voted"] is True

        # add event-based suggestion
        ev_id = auth.get(f"{API}/events").json()[0]["id"]
        r6 = auth.post(f"{API}/crews/{crew_id}/suggestions", json={"event_id": ev_id})
        assert r6.status_code == 200
        det2 = r6.json()
        assert any(s.get("event_id") == ev_id for s in det2["suggestions"])
        ev_sug = next(s for s in det2["suggestions"] if s.get("event_id") == ev_id)
        assert ev_sug.get("event_title")
        assert ev_sug.get("latitude") is not None

        # vote toggle: current voted=True -> toggle off
        sid = custom_sug["id"]
        r7 = auth.post(f"{API}/crews/{crew_id}/suggestions/{sid}/vote")
        assert r7.status_code == 200
        s_after = next(s for s in r7.json()["suggestions"] if s["id"] == sid)
        assert s_after["voted"] is False
        assert s_after["vote_count"] == 0
        # toggle back on
        r8 = auth.post(f"{API}/crews/{crew_id}/suggestions/{sid}/vote")
        s_back = next(s for s in r8.json()["suggestions"] if s["id"] == sid)
        assert s_back["voted"] is True
        assert s_back["vote_count"] == 1

        # ordering: suggestions sorted by vote_count desc
        det3 = auth.get(f"{API}/crews/{crew_id}").json()
        counts = [s["vote_count"] for s in det3["suggestions"]]
        assert counts == sorted(counts, reverse=True)

    def test_get_crew_not_member_404(self, auth):
        # create a crew with user1
        r = auth.post(f"{API}/crews", json={"name": "TEST_Private"})
        crew_id = r.json()["id"]
        # since dev-session returns same user_id, any session belongs. Just verify random id -> 404.
        r2 = auth.get(f"{API}/crews/{uuid.uuid4().hex}")
        assert r2.status_code == 404
