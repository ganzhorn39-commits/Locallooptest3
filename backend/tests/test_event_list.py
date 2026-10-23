"""GET /api/events: cancelled events leave the list, host info for search/business pins, real trend score."""
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


def _session(alias: str, business_name: str = ""):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    if business_name:
        s.patch(f"{API}/profile", json={"account_type": "business", "business_name": business_name})
    else:
        s.patch(f"{API}/profile", json={"name": f"Tom {RUN}"})
    return s, r.json()["user"]["user_id"]


def _event(sess, title):
    r = sess.post(f"{API}/events", json={
        "title": title, "category": "food", "start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "latitude": 49.0, "longitude": 8.4, "address": "TEST",
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _listed(eid):
    return next((e for e in requests.get(f"{API}/events").json() if e["id"] == eid), None)


def test_cancelled_events_leave_the_list():
    host, _ = _session(f"listhost-{RUN}")
    eid = _event(host, f"TEST_ListCancel_{RUN}")
    assert _listed(eid) is not None
    assert host.post(f"{API}/events/{eid}/cancel").status_code == 200
    assert _listed(eid) is None
    # the event page itself still works (chat members, links)
    r = requests.get(f"{API}/events/{eid}")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"


def test_host_info_for_business_and_person():
    biz, _ = _session(f"listbiz-{RUN}", business_name=f"TEST Kiosk {RUN}")
    person, _ = _session(f"listperson-{RUN}")
    biz_event = _event(biz, f"TEST_ListBiz_{RUN}")
    person_event = _event(person, f"TEST_ListPerson_{RUN}")
    b = _listed(biz_event)
    assert b["host_is_business"] is True and b["host_name"] == f"TEST Kiosk {RUN}"
    p = _listed(person_event)
    assert p["host_is_business"] is False and p["host_name"] == f"Tom {RUN}"
    assert requests.get(f"{API}/events/{biz_event}").json()["host_name"] == f"TEST Kiosk {RUN}"


def test_trend_score_counts_real_checkins_and_saves():
    host, _ = _session(f"trendhost-{RUN}")
    eid = _event(host, f"TEST_Trend_{RUN}")
    assert _listed(eid)["trend_score"] == 0
    g1, _ = _session(f"trendg1-{RUN}")
    g2, _ = _session(f"trendg2-{RUN}")
    g1.post(f"{API}/events/{eid}/checkin", json={})
    g2.post(f"{API}/events/{eid}/checkin", json={})
    g2.post(f"{API}/events/{eid}/save")
    assert _listed(eid)["trend_score"] == 3
