"""Moderation & registration rules.
Covers: reports (validation, duplicates, auto-hide of chat messages), blocking (messages, events,
participants, profile flag, list, account deletion), the word filter (chat/reviews censored,
event/profile texts rejected), birthdate lock after onboarding and the registration confirmations.
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
SOON = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()


def _session(alias: str, **profile):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    if profile:
        assert s.patch(f"{API}/profile", json=profile).status_code == 200
    return s, r.json()["user"]["user_id"]


def _event(sess, title, **extra):
    r = sess.post(f"{API}/events", json={
        "title": title, "category": "food", "start_time": SOON,
        "latitude": 49.0, "longitude": 8.4, "address": "TEST", **extra,
    })
    return r


@pytest.fixture(scope="module")
def host():
    return _session(f"modhost-{RUN}", name="Mod Host")


@pytest.fixture(scope="module")
def alice():
    return _session(f"modalice-{RUN}", name="Alice")


@pytest.fixture(scope="module")
def bob():
    return _session(f"modbob-{RUN}", name="Bob")


@pytest.fixture(scope="module")
def event_id(host, alice, bob):
    r = _event(host[0], f"TEST_Mod_{RUN}")
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    for s, _ in (alice, bob):
        assert s.post(f"{API}/events/{eid}/checkin", json={"visibility": "public"}).json()["checked_in"] is True
    return eid


class TestWordFilter:
    def test_chat_message_is_censored(self, alice, event_id):
        r = alice[0].post(f"{API}/events/{event_id}/messages", json={"text": "Du Arschloch, bis später im Marsch!"})
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["text"] == "Du A********, bis später im Marsch!"
        assert m["censored"] is True
        clean = alice[0].post(f"{API}/events/{event_id}/messages", json={"text": "Bin gegen 20 Uhr da"}).json()
        assert clean["censored"] is False and clean["text"] == "Bin gegen 20 Uhr da"

    def test_review_is_censored(self, alice, event_id):
        r = alice[0].post(f"{API}/events/{event_id}/reviews", json={"rating": 2, "comment": "fucking laut"})
        assert r.status_code == 200
        assert r.json()["review"]["comment"] == "f****** laut"

    def test_event_texts_are_rejected(self, host):
        r = _event(host[0], f"TEST Hurensohn Party {RUN}")
        assert r.status_code == 400
        d = r.json()["detail"]
        assert d["code"] == "profanity" and d["field"] == "title" and d["words"] == ["Hurensohn"]
        assert _event(host[0], f"TEST_ok_{RUN}", description="Fick dich").status_code == 400

    def test_event_edit_is_checked(self, host, event_id):
        r = host[0].patch(f"{API}/events/{event_id}", json={"description": "Nur für Wichser"})
        assert r.status_code == 400 and r.json()["detail"]["field"] == "description"

    def test_profile_texts_are_rejected(self, alice):
        r = alice[0].patch(f"{API}/profile", json={"name": "Schlampe"})
        assert r.status_code == 400 and r.json()["detail"]["field"] == "name"
        assert alice[0].get(f"{API}/auth/me").json()["name"] == "Alice"


class TestReports:
    def test_validation(self, alice, bob, event_id):
        s = alice[0]
        assert s.post(f"{API}/reports", json={"target_type": "post", "target_id": "x", "reason": "spam"}).status_code == 400
        assert s.post(f"{API}/reports", json={"target_type": "user", "target_id": bob[1], "reason": "meh"}).status_code == 400
        assert s.post(f"{API}/reports", json={"target_type": "user", "target_id": "nobody", "reason": "spam"}).status_code == 404
        assert s.post(f"{API}/reports", json={"target_type": "user", "target_id": alice[1], "reason": "spam"}).status_code == 400

    def test_report_user_and_event(self, alice, bob, event_id):
        s = alice[0]
        assert s.post(f"{API}/reports", json={"target_type": "user", "target_id": bob[1], "reason": "harassment", "note": "TEST"}).status_code == 200
        assert s.post(f"{API}/reports", json={"target_type": "user", "target_id": bob[1], "reason": "spam"}).status_code == 200
        assert s.post(f"{API}/reports", json={"target_type": "event", "target_id": event_id, "reason": "fake"}).status_code == 200

    def test_message_hidden_after_three_reports(self, host, alice, bob, event_id):
        msg = bob[0].post(f"{API}/events/{event_id}/messages", json={"text": f"TEST spam {RUN}"}).json()
        carol, _ = _session(f"modcarol-{RUN}")
        assert carol.post(f"{API}/events/{event_id}/checkin", json={}).json()["checked_in"] is True
        for s in (host[0], alice[0]):
            assert s.post(f"{API}/reports", json={"target_type": "message", "target_id": msg["id"], "reason": "spam"}).status_code == 200
        assert any(m["id"] == msg["id"] for m in alice[0].get(f"{API}/events/{event_id}/messages").json())
        assert carol.post(f"{API}/reports", json={"target_type": "message", "target_id": msg["id"], "reason": "spam"}).status_code == 200
        assert not any(m["id"] == msg["id"] for m in alice[0].get(f"{API}/events/{event_id}/messages").json())
        assert any(m["id"] == msg["id"] for m in bob[0].get(f"{API}/events/{event_id}/messages").json())  # author still sees it

    def test_admin_queue_is_protected(self, alice):
        assert alice[0].get(f"{API}/admin/reports").status_code == 403


class TestBlocking:
    def test_block_hides_messages_events_and_participants(self, host, alice, bob, event_id):
        bob[0].post(f"{API}/events/{event_id}/messages", json={"text": f"TEST hallo von bob {RUN}"})
        bob_event = _event(bob[0], f"TEST_BobEvent_{RUN}").json()["id"]
        a = alice[0]
        assert any(e["id"] == bob_event for e in a.get(f"{API}/events").json())

        r = a.post(f"{API}/users/{bob[1]}/block")
        assert r.status_code == 200 and r.json()["blocked"] is True
        assert a.get(f"{API}/users/{bob[1]}").json()["blocked"] is True
        assert requests.get(f"{API}/users/{bob[1]}").json()["blocked"] is False  # guests: no flag
        assert not any(m["user_id"] == bob[1] for m in a.get(f"{API}/events/{event_id}/messages").json())
        assert not any(e["id"] == bob_event for e in a.get(f"{API}/events").json())
        assert any(e["id"] == bob_event for e in host[0].get(f"{API}/events").json())  # others unaffected
        pt = a.get(f"{API}/events/{event_id}/participants").json()
        assert not any(p.get("user_id") == bob[1] for p in pt["participants"])
        assert [u["user_id"] for u in a.get(f"{API}/my/blocks").json()] == [bob[1]]

        r = a.post(f"{API}/users/{bob[1]}/block")
        assert r.json()["blocked"] is False
        assert any(m["user_id"] == bob[1] for m in a.get(f"{API}/events/{event_id}/messages").json())

    def test_cannot_block_self_or_unknown(self, alice):
        assert alice[0].post(f"{API}/users/{alice[1]}/block").status_code == 400
        assert alice[0].post(f"{API}/users/nobody_{RUN}/block").status_code == 404

    def test_account_deletion_removes_blocks(self, alice):
        gone, gone_id = _session(f"modgone-{RUN}")
        assert gone.post(f"{API}/users/{alice[1]}/block").json()["blocked"] is True
        assert alice[0].post(f"{API}/users/{gone_id}/block").json()["blocked"] is True
        assert gone.delete(f"{API}/profile").status_code == 200
        assert alice[0].get(f"{API}/my/blocks").json() == []


class TestRegistration:
    def test_birthdate_locked_after_onboarding(self):
        s, _ = _session(f"modbirth-{RUN}")
        assert s.patch(f"{API}/profile", json={"birthdate": "2001-01-01"}).status_code == 200
        assert s.patch(f"{API}/profile", json={"birthdate": "2002-02-02"}).status_code == 200  # still onboarding
        assert s.patch(f"{API}/profile", json={"onboarded": True, "accept_terms": True, "confirm_truth": True}).status_code == 200
        r = s.patch(f"{API}/profile", json={"birthdate": "1990-01-01"})
        assert r.status_code == 409
        assert s.patch(f"{API}/profile", json={"birthdate": "2002-02-02", "bio": "TEST"}).status_code == 200  # same value ok
        me = s.get(f"{API}/auth/me").json()
        assert me["birthdate"] == "2002-02-02"
        assert me["terms_accepted_at"] and me["truth_confirmed_at"]

    def test_confirmations_are_not_reset(self):
        s, _ = _session(f"modterms-{RUN}")
        first = s.patch(f"{API}/profile", json={"accept_terms": True}).json()["terms_accepted_at"]
        again = s.patch(f"{API}/profile", json={"accept_terms": False, "bio": "x"}).json()
        assert again["terms_accepted_at"] == first
        assert "accept_terms" not in again and "confirm_truth" not in again
