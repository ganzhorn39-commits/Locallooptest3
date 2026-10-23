"""Notification center (bell): join requests, approvals, rejections, chat (grouped), event changes,
cancellations, reminders for the next 24h, blocking, read state and push preferences."""
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


def _session(alias: str, **profile):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    s.patch(f"{API}/profile", json={"name": alias.split("-")[0].title(), **profile})
    return s, r.json()["user"]["user_id"]


def _event(sess, title, hours=48, **extra):
    r = sess.post(f"{API}/events", json={
        "title": title, "category": "food", "start_time": (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat(),
        "latitude": 49.0, "longitude": 8.4, "address": "TEST", **extra,
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _items(sess, ntype=None, event_id=None):
    data = sess.get(f"{API}/notifications").json()
    return [n for n in data["items"] if (ntype is None or n["type"] == ntype) and (event_id is None or n.get("event_id") == event_id)]


@pytest.fixture(scope="module")
def host():
    return _session(f"nhost-{RUN}")


@pytest.fixture(scope="module")
def guest():
    return _session(f"nguest-{RUN}")


@pytest.fixture(scope="module")
def manual_event(host):
    return _event(host[0], f"TEST_Notif_{RUN}", join_approval="manual")


class TestNotificationCenter:
    def test_requires_auth(self):
        assert requests.get(f"{API}/notifications").status_code == 401
        assert requests.get(f"{API}/notifications/unread-count").status_code == 401

    def test_join_request_notifies_host(self, host, guest, manual_event):
        assert guest[0].post(f"{API}/events/{manual_event}/checkin", json={}).json()["pending"] is True
        items = _items(host[0], "join_request", manual_event)
        assert len(items) == 1
        n = items[0]
        assert n["params"]["event_title"] == f"TEST_Notif_{RUN}" and n["params"]["user_name"] == "Nguest"
        assert n["action_url"] == "/dashboard" and n["read_at"] is None
        assert host[0].get(f"{API}/notifications/unread-count").json()["unread"] >= 1

    def test_approve_notifies_guest(self, host, guest, manual_event):
        assert host[0].post(f"{API}/events/{manual_event}/requests/{guest[1]}/approve").status_code == 200
        items = _items(guest[0], "request_approved", manual_event)
        assert len(items) == 1 and items[0]["action_url"] == f"/chat/{manual_event}"

    def test_reject_notifies_once(self, host):
        eid = _event(host[0], f"TEST_NotifReject_{RUN}", join_approval="manual")
        other, other_id = _session(f"nreject-{RUN}")
        other.post(f"{API}/events/{eid}/checkin", json={})
        assert host[0].post(f"{API}/events/{eid}/requests/{other_id}/reject").status_code == 200
        assert host[0].post(f"{API}/events/{eid}/requests/{other_id}/reject").status_code == 200  # nothing left
        assert len(_items(other, "request_rejected", eid)) == 1

    def test_chat_is_grouped_and_cleared_on_open(self, host, guest, manual_event):
        for text in ("Hallo zusammen", "Wer bringt Snacks mit?"):
            assert guest[0].post(f"{API}/events/{manual_event}/messages", json={"text": text}).status_code == 200
        items = [n for n in _items(host[0], "chat", manual_event) if n["read_at"] is None]
        assert len(items) == 1
        assert items[0]["count"] == 2 and items[0]["params"]["text"] == "Wer bringt Snacks mit?"
        assert _items(guest[0], "chat", manual_event) == []  # no notification for your own messages
        # hosts read the chat of their own event without checking in; opening it clears the entry
        assert host[0].get(f"{API}/events/{manual_event}/messages").status_code == 200
        assert all(n["read_at"] for n in _items(host[0], "chat", manual_event))

    def test_blocked_people_do_not_notify(self, host, guest, manual_event):
        assert host[0].post(f"{API}/users/{guest[1]}/block").json()["blocked"] is True
        guest[0].post(f"{API}/events/{manual_event}/messages", json={"text": "noch da?"})
        assert [n for n in _items(host[0], "chat", manual_event) if n["read_at"] is None] == []
        assert host[0].post(f"{API}/users/{guest[1]}/block").json()["blocked"] is False

    def test_event_change_and_cancel(self, host, guest, manual_event):
        later = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        assert host[0].patch(f"{API}/events/{manual_event}", json={"start_time": later}).status_code == 200
        upd = _items(guest[0], "event_updated", manual_event)
        assert len(upd) == 1 and upd[0]["params"]["what"] == "time"
        assert _items(host[0], "event_updated", manual_event) == []  # not to the host who changed it
        msgs = guest[0].get(f"{API}/events/{manual_event}/messages").json()
        assert any(m.get("system_key") == "updated_time" for m in msgs)
        assert host[0].post(f"{API}/events/{manual_event}/cancel").status_code == 200
        assert len(_items(guest[0], "event_cancelled", manual_event)) == 1

    def test_reminders_within_24h_only_once(self, host, guest):
        soon = _event(host[0], f"TEST_Soon_{RUN}", hours=3)
        later = _event(host[0], f"TEST_Later_{RUN}", hours=72)
        g = guest[0]
        g.post(f"{API}/events/{soon}/checkin", json={})
        g.post(f"{API}/events/{later}/save")
        g.get(f"{API}/notifications/unread-count")
        rem = _items(g, "reminder", soon)
        assert len(rem) == 1 and rem[0]["params"]["event_title"] == f"TEST_Soon_{RUN}"
        assert _items(g, "reminder", later) == []
        g.get(f"{API}/notifications")
        assert len(_items(g, "reminder", soon)) == 1

    def test_mark_read(self, guest):
        g = guest[0]
        first = _items(g)[0]
        assert g.post(f"{API}/notifications/read", json={"ids": [first["id"]]}).json()["updated"] == 1
        assert next(n for n in _items(g) if n["id"] == first["id"])["read_at"]
        g.post(f"{API}/notifications/read", json={})
        assert g.get(f"{API}/notifications/unread-count").json()["unread"] == 0

    def test_push_preferences_and_language(self, guest):
        g = guest[0]
        assert g.patch(f"{API}/profile", json={"lang": "fr"}).status_code == 400
        me = g.patch(f"{API}/profile", json={"lang": "de", "push_messages": False}).json()
        assert me["lang"] == "de" and me["push_messages"] is False
