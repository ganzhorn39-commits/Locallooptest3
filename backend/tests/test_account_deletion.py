"""DELETE /api/profile removes everything the user left behind on other people's events:
check-ins (+ event counter), saves, join requests, reviews (+ rating), chat messages, crew votes."""
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

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


def _event(sess, title, **extra):
    r = sess.post(f"{API}/events", json={
        "title": title, "category": "food", "start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "latitude": 49.0, "longitude": 8.4, "address": "TEST", **extra,
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_delete_account_cleans_up_traces():
    host, _ = _session(f"delhost-{RUN}")
    leaver, leaver_id = _session(f"leaver-{RUN}")
    ev = _event(host, f"TEST_Del_{RUN}")
    manual = _event(host, f"TEST_DelManual_{RUN}", join_approval="manual")

    assert leaver.post(f"{API}/events/{ev}/checkin", json={"visibility": "public"}).json()["checked_in"] is True
    assert leaver.post(f"{API}/events/{ev}/save").json()["saved"] is True
    assert leaver.post(f"{API}/events/{ev}/reviews", json={"rating": 1, "comment": "TEST bye"}).status_code == 200
    assert leaver.post(f"{API}/events/{ev}/messages", json={"text": f"TEST msg {RUN}"}).status_code == 200
    assert leaver.post(f"{API}/events/{manual}/checkin", json={}).json()["pending"] is True
    crew = leaver.post(f"{API}/crews", json={"name": f"TEST crew {RUN}"}).json()
    leaver.post(f"{API}/crews/{crew['id']}/suggestions", json={"custom_text": "TEST idea"})

    before = host.get(f"{API}/my/dashboard").json()
    assert before["totals"]["saves"] == 1 and before["totals"]["reviews"] == 1
    assert before["totals"]["pending_requests"] == 1
    assert host.get(f"{API}/events/{ev}").json()["checkins"] == 1

    assert leaver.delete(f"{API}/profile").status_code == 200
    assert leaver.get(f"{API}/auth/me").status_code == 401

    after = host.get(f"{API}/my/dashboard").json()
    assert after["totals"]["checkins"] == 0
    assert after["totals"]["saves"] == 0
    assert after["totals"]["reviews"] == 0
    assert after["totals"]["rating_count"] == 0
    assert after["totals"]["pending_requests"] == 0
    assert host.get(f"{API}/events/{ev}").json()["checkins"] == 0
    assert host.get(f"{API}/events/{ev}").json()["rating_count"] == 0

    # chat history no longer shows the deleted user (host joins own event to read the chat)
    assert host.post(f"{API}/events/{ev}/checkin", json={}).json()["checked_in"] is True
    msgs = host.get(f"{API}/events/{ev}/messages").json()
    assert all(m.get("user_id") != leaver_id for m in msgs)
    assert requests.get(f"{API}/users/{leaver_id}").status_code == 404
