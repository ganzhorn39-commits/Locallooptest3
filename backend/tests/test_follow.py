"""Followers: follow/unfollow people and venues, counts and lists, notifications, followed people going to events."""
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


def _session(alias, **profile):
    s = requests.Session()
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    s.patch(f"{API}/profile", json={"name": alias.split("-")[0].title(), **profile})
    return s, r.json()["user"]["user_id"]


@pytest.fixture(scope="module")
def people():
    return {
        "venue": _session(f"fvenue-{RUN}", account_type="business", business_name=f"Bar {RUN}"),
        "anna": _session(f"fanna-{RUN}"),
        "ben": _session(f"fben-{RUN}"),
    }


def _items(s, ntype):
    return [n for n in s.get(f"{API}/notifications").json()["items"] if n["type"] == ntype]


def test_follow_toggle_counts_and_lists(people):
    (v, vid), (a, aid), (b, bid) = people["venue"], people["anna"], people["ben"]
    r = a.post(f"{API}/users/{vid}/follow")
    assert r.status_code == 200 and r.json() == {"following": True, "followers_count": 1}
    b.post(f"{API}/users/{vid}/follow")
    b.post(f"{API}/users/{aid}/follow")
    prof = a.get(f"{API}/users/{vid}").json()
    assert prof["followers_count"] == 2 and prof["is_following"] is True and prof["follows_you"] is False
    assert a.get(f"{API}/users/{bid}").json()["follows_you"] is True
    names = [u["name"] for u in requests.get(f"{API}/users/{vid}/followers").json()]
    assert set(names) == {"Fanna", "Fben"}
    lst = a.get(f"{API}/users/{bid}/following").json()
    assert {u["user_id"] for u in lst} == {vid, aid} and [u for u in lst if u["user_id"] == aid][0]["is_me"] is True
    assert a.post(f"{API}/users/{aid}/follow").status_code == 400
    # unfollow + follow again -> only one "new follower" note
    a.post(f"{API}/users/{vid}/follow")
    assert a.post(f"{API}/users/{vid}/follow").json()["following"] is True
    notes = [n for n in _items(v, "new_follower") if n["params"].get("user_id") == aid]
    assert len(notes) == 1 and notes[0]["action_url"] == f"/user/{aid}"


def test_new_event_notifies_followers(people):
    (v, vid), (a, aid) = people["venue"], people["anna"]
    eid = v.post(f"{API}/events", json={
        "title": f"TEST_Follow_{RUN}", "category": "food", "latitude": 49.0, "longitude": 8.4, "address": "TEST",
        "start_time": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()}).json()["id"]
    notes = [n for n in _items(a, "followed_event") if n["event_id"] == eid]
    assert len(notes) == 1 and notes[0]["params"]["host_name"] == f"Bar {RUN}"
    assert any(e["id"] == eid for e in requests.get(f"{API}/users/{vid}/events").json())
    people["eid"] = eid


def test_followed_people_going(people):
    (a, aid), (b, bid) = people["anna"], people["ben"]
    eid = people["eid"]
    a.post(f"{API}/events/{eid}/checkin", json={"visibility": "public"})
    ev = [e for e in b.get(f"{API}/events").json() if e["id"] == eid][0]
    assert ev["friends_going"] == 1 and ev["friends_names"] == ["Fanna"] and ev["followed_host"] is True
    parts = b.get(f"{API}/events/{eid}/participants").json()["participants"]
    assert [p for p in parts if p.get("user_id") == aid][0]["following"] is True


def test_block_removes_follow(people):
    (a, aid), (b, bid) = people["anna"], people["ben"]
    a.post(f"{API}/users/{bid}/block")
    assert a.get(f"{API}/users/{bid}").json()["follows_you"] is False
    r = b.post(f"{API}/users/{aid}/follow")
    assert r.status_code == 403
    a.post(f"{API}/users/{bid}/block")  # unblock again
