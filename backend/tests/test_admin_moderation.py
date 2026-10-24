"""Moderation for ADMIN_EMAILS: grouped report queue, remove message / event, ban accounts.
Needs ADMIN_EMAILS to contain demo+modadmin@localloop.app (the local test harness sets it); skipped otherwise."""
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


def _session(alias):
    s = requests.Session()
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    s.patch(f"{API}/profile", json={"name": alias.split("-")[0].title(), "accept_terms": True})
    return s, r.json()["user"]["user_id"]


@pytest.fixture(scope="module")
def admin():
    s, uid = _session("modadmin")
    if not s.get(f"{API}/auth/me").json().get("is_admin"):
        pytest.skip("ADMIN_EMAILS does not include the test admin")
    return s, uid


@pytest.fixture(scope="module")
def world(admin):
    host, host_id = _session(f"modhost-{RUN}")
    troll, troll_id = _session(f"modtroll-{RUN}")
    r1, _ = _session(f"modrep1-{RUN}")
    r2, _ = _session(f"modrep2-{RUN}")
    eid = host.post(f"{API}/events", json={
        "title": f"TEST_Mod_{RUN}", "category": "food", "latitude": 49.0, "longitude": 8.4, "address": "TEST",
        "start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}).json()["id"]
    bad_eid = troll.post(f"{API}/events", json={
        "title": f"TEST_ModSpam_{RUN}", "category": "food", "latitude": 49.0, "longitude": 8.4, "address": "TEST",
        "start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}).json()["id"]
    for s in (troll, r1, r2):
        s.post(f"{API}/events/{eid}/checkin", json={})
    msg = troll.post(f"{API}/events/{eid}/messages", json={"text": "Kauft billige Follower!!!"}).json()
    for s, reason in ((r1, "spam"), (r2, "harassment")):
        assert s.post(f"{API}/reports", json={"target_type": "message", "target_id": msg["id"], "reason": reason}).status_code == 200
    r1.post(f"{API}/reports", json={"target_type": "event", "target_id": bad_eid, "reason": "spam"})
    return {"host": host, "troll": troll, "troll_id": troll_id, "r1": r1, "eid": eid, "bad_eid": bad_eid, "msg": msg}


def _queue(admin):
    return admin[0].get(f"{API}/admin/reports").json()


def test_non_admins_are_refused(world):
    assert world["r1"].get(f"{API}/admin/reports").status_code == 403
    assert world["r1"].get(f"{API}/auth/me").json()["is_admin"] is False


def test_queue_groups_reports(admin, world):
    q = {g["target_id"]: g for g in _queue(admin)}
    g = q[world["msg"]["id"]]
    assert g["count"] == 2 and set(g["reasons"]) == {"spam", "harassment"} and g["owner_name"] == "Modtroll"


def test_remove_message(admin, world):
    rid = {g["target_id"]: g for g in _queue(admin)}[world["msg"]["id"]]["id"]
    assert admin[0].post(f"{API}/admin/reports/{rid}", json={"action": "remove"}).status_code == 200
    msgs = world["troll"].get(f"{API}/events/{world['eid']}/messages").json()
    assert all(m["id"] != world["msg"]["id"] for m in msgs)  # gone, also for its author
    assert world["msg"]["id"] not in [g["target_id"] for g in _queue(admin)]


def test_ban_user(admin, world):
    rid = {g["target_id"]: g for g in _queue(admin)}[world["bad_eid"]]["id"]
    assert admin[0].post(f"{API}/admin/reports/{rid}", json={"action": "ban"}).status_code == 200
    r = world["troll"].get(f"{API}/auth/me")
    assert r.status_code in (401, 403)  # sessions deleted
    r = requests.post(f"{API}/auth/dev-session", json={"alias": f"modtroll-{RUN}"})
    tok = r.json()["session_token"]
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "banned"
    assert all(e["id"] != world["bad_eid"] for e in requests.get(f"{API}/events").json())
    assert requests.get(f"{API}/events/{world['bad_eid']}").status_code == 404


def test_dismiss(admin, world):
    world["r1"].post(f"{API}/reports", json={"target_type": "event", "target_id": world["eid"], "reason": "other"})
    rid = {g["target_id"]: g for g in _queue(admin)}[world["eid"]]["id"]
    assert admin[0].post(f"{API}/admin/reports/{rid}", json={"action": "dismiss"}).status_code == 200
    assert any(e["id"] == world["eid"] for e in requests.get(f"{API}/events").json())
