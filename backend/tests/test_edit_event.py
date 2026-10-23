"""PATCH /api/events/{id}: host-only editing.
Covers auth/ownership, partial updates, validation (title, start_time, join_approval, capacity vs. check-ins),
cancelled events, protected fields, and the chat notice + push when time or place change.
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
START = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=3)


def _session(alias: str):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    return s, r.json()["user"]["user_id"]


@pytest.fixture(scope="module")
def host():
    return _session(f"edithost-{RUN}")


@pytest.fixture(scope="module")
def guest():
    return _session(f"editguest-{RUN}")


@pytest.fixture(scope="module")
def event_id(host, guest):
    r = host[0].post(f"{API}/events", json={
        "title": f"TEST_Edit_{RUN}", "category": "food", "start_time": START.isoformat(),
        "description": "original", "capacity": 10, "latitude": 49.0, "longitude": 8.4, "address": "TEST Old",
    })
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    assert guest[0].post(f"{API}/events/{eid}/checkin", json={"visibility": "public"}).json()["checked_in"] is True
    return eid


def _system_messages(sess, eid):
    msgs = sess.get(f"{API}/events/{eid}/messages").json()
    return [m for m in msgs if m.get("system")]


class TestEditEvent:
    def test_requires_auth(self, event_id):
        assert requests.patch(f"{API}/events/{event_id}", json={"title": "x"}).status_code == 401

    def test_only_host_can_edit(self, guest, event_id):
        assert guest[0].patch(f"{API}/events/{event_id}", json={"title": "hijack"}).status_code == 403

    def test_unknown_event(self, host):
        assert host[0].patch(f"{API}/events/does-not-exist", json={"title": "x"}).status_code == 404

    def test_partial_update_keeps_other_fields(self, host, guest, event_id):
        r = host[0].patch(f"{API}/events/{event_id}", json={"title": f"  TEST_Edited_{RUN}  ", "description": "new text"})
        assert r.status_code == 200, r.text
        e = requests.get(f"{API}/events/{event_id}").json()
        assert e["title"] == f"TEST_Edited_{RUN}"
        assert e["description"] == "new text"
        assert e["capacity"] == 10 and e["address"] == "TEST Old" and e["category"] == "food"
        # title/description changes are not announced in the chat
        assert _system_messages(guest[0], event_id) == []

    def test_protected_fields_are_ignored(self, host, event_id):
        r = host[0].patch(f"{API}/events/{event_id}", json={"created_by": "someone_else", "status": "cancelled", "checkins": 999})
        assert r.status_code == 200
        e = requests.get(f"{API}/events/{event_id}").json()
        assert e["created_by"] == host[1]
        assert e.get("status", "active") == "active"
        assert e["checkins"] == 1

    def test_validation(self, host, event_id):
        assert host[0].patch(f"{API}/events/{event_id}", json={"title": "   "}).status_code == 400
        assert host[0].patch(f"{API}/events/{event_id}", json={"start_time": "next friday"}).status_code == 400
        assert host[0].patch(f"{API}/events/{event_id}", json={"join_approval": "sometimes"}).status_code == 400

    def test_capacity_cannot_drop_below_checkins(self, host, guest, event_id):
        other, _ = _session(f"editother-{RUN}")
        assert other.post(f"{API}/events/{event_id}/checkin", json={}).json()["checked_in"] is True
        assert host[0].patch(f"{API}/events/{event_id}", json={"capacity": 1}).status_code == 409
        assert host[0].patch(f"{API}/events/{event_id}", json={"capacity": 2}).status_code == 200
        assert host[0].patch(f"{API}/events/{event_id}", json={"capacity": 0}).status_code == 200  # 0 = unlimited
        assert requests.get(f"{API}/events/{event_id}").json()["capacity"] == 0

    def test_same_values_do_not_notify(self, host, guest, event_id):
        e = requests.get(f"{API}/events/{event_id}").json()
        r = host[0].patch(f"{API}/events/{event_id}", json={
            "start_time": e["start_time"], "address": e["address"], "latitude": e["latitude"], "longitude": e["longitude"],
        })
        assert r.status_code == 200
        assert _system_messages(guest[0], event_id) == []

    def test_time_change_posts_notice(self, host, guest, event_id):
        new_start = (START + timedelta(hours=2)).isoformat().replace("+00:00", "Z")
        r = host[0].patch(f"{API}/events/{event_id}", json={"start_time": new_start})
        assert r.status_code == 200
        assert r.json()["next_occurrence"] == new_start
        notices = _system_messages(guest[0], event_id)
        assert len(notices) == 1 and "time" in notices[0]["text"] and "place" not in notices[0]["text"]

    def test_place_change_posts_notice(self, host, guest, event_id):
        r = host[0].patch(f"{API}/events/{event_id}", json={"address": "TEST New", "latitude": 49.01, "longitude": 8.41})
        assert r.status_code == 200
        notices = _system_messages(guest[0], event_id)
        assert len(notices) == 2 and "place" in notices[-1]["text"]

    def test_make_recurring(self, host, event_id):
        r = host[0].patch(f"{API}/events/{event_id}", json={
            "is_recurring": True, "recurrence_freq": "weekly", "recurrence_days": [0, 3],
            "recurrence_label": "Every week · Mon, Thu at 8:00 PM",
        })
        assert r.status_code == 200
        nxt = datetime.fromisoformat(r.json()["next_occurrence"].replace("Z", "+00:00"))
        assert nxt.weekday() in (0, 3)

    def test_cancelled_event_is_locked(self, host, event_id):
        assert host[0].post(f"{API}/events/{event_id}/cancel").status_code == 200
        assert host[0].patch(f"{API}/events/{event_id}", json={"title": "too late"}).status_code == 409
