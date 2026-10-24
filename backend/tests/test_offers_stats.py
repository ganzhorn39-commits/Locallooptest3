"""Up to three offers per event (one deal per person and event), event views and the 7/30-day host statistics."""
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
def biz():
    return _session(f"obiz-{RUN}", account_type="business", business_name=f"Café {RUN}")


@pytest.fixture(scope="module")
def guests():
    return [_session(f"oguest{i}-{RUN}") for i in range(3)]


def _event(s, **extra):
    return s.post(f"{API}/events", json={
        "title": f"TEST_Offers_{RUN}", "category": "cafe", "latitude": 49.0, "longitude": 8.4, "address": "TEST",
        "start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), **extra})


def test_offer_rules(biz, guests):
    assert _event(biz[0], offers=[{"title": f"A{i}"} for i in range(4)]).json()["detail"]["code"] == "too_many_offers"
    assert _event(guests[0][0], offers=[{"title": "Gratis"}]).status_code == 403
    assert _event(biz[0], offers=[{"title": "Hurensohn-Rabatt"}]).status_code == 400


def test_three_offers_one_deal_each(biz, guests):
    r = _event(biz[0], offers=[{"title": "10 % auf Kaffee", "limit": 1}, {"title": "Gratis Keks"}, {"title": "2 für 1 Kuchen", "limit": 2}])
    assert r.status_code == 200, r.text
    ev = r.json()
    offers = ev["offers"]
    assert [o["title"] for o in offers] == ["10 % auf Kaffee", "Gratis Keks", "2 für 1 Kuchen"]
    assert ev["offer_title"] == "10 % auf Kaffee"  # older app versions keep working with the first offer
    eid = ev["id"]
    for s, _ in guests:
        s.post(f"{API}/events/{eid}/checkin", json={})
    g0, g1, g2 = (g[0] for g in guests)
    assert g0.post(f"{API}/events/{eid}/deal", json={"offer_id": offers[0]["id"]}).json()["offer_title"] == "10 % auf Kaffee"
    r = g1.post(f"{API}/events/{eid}/deal", json={"offer_id": offers[0]["id"]})
    assert r.status_code == 409  # limit 1
    assert g1.post(f"{API}/events/{eid}/deal", json={"offer_id": offers[2]["id"]}).json()["offer_title"] == "2 für 1 Kuchen"
    # one deal per person and event: asking again (other offer) returns the existing one
    r = g1.post(f"{API}/events/{eid}/deal", json={"offer_id": offers[1]["id"]}).json()
    assert r["already"] is True and r["offer_title"] == "2 für 1 Kuchen"
    assert g2.post(f"{API}/events/{eid}/deal", json={"offer_id": "nope"}).status_code == 404
    claimed = {o["title"]: o["claimed"] for o in requests.get(f"{API}/events/{eid}").json()["offers"]}
    assert claimed == {"10 % auf Kaffee": 1, "Gratis Keks": 0, "2 für 1 Kuchen": 1}
    # leaving gives the deal back to its own offer
    g1.post(f"{API}/events/{eid}/checkin", json={})
    claimed = {o["title"]: o["claimed"] for o in requests.get(f"{API}/events/{eid}").json()["offers"]}
    assert claimed["2 für 1 Kuchen"] == 0
    # editing: limit below claimed is refused; removing the first offer keeps the claimed one valid
    r = biz[0].patch(f"{API}/events/{eid}", json={"offers": [{"id": offers[0]["id"], "title": "10 % auf Kaffee", "limit": 0},
                                                            {"id": offers[2]["id"], "title": "2 für 1 Kuchen", "limit": 0}]})
    assert r.status_code == 200 and len(r.json()["offers"]) == 2
    r = biz[0].patch(f"{API}/events/{eid}", json={"offers": [{"id": offers[2]["id"], "title": "2 für 1 Kuchen", "limit": 5}]})
    assert r.status_code == 200 and [o["title"] for o in r.json()["offers"]] == ["2 für 1 Kuchen"]
    assert g0.get(f"{API}/events/{eid}/deal").json()["deal"]["offer_title"] == "10 % auf Kaffee"


def test_views_and_dashboard_stats(biz, guests):
    eid = _event(biz[0]).json()["id"]
    for s, _ in guests:
        assert s.post(f"{API}/events/{eid}/view", json={}).json()["counted"] is True
        s.post(f"{API}/events/{eid}/view", json={})  # same person same day counts once
    requests.post(f"{API}/events/{eid}/view", json={"device_id": f"dev-{RUN}"})
    assert requests.post(f"{API}/events/{eid}/view", json={}).json()["counted"] is False  # anonymous without id
    assert biz[0].post(f"{API}/events/{eid}/view", json={}).json()["counted"] is False  # host
    guests[0][0].post(f"{API}/events/{eid}/checkin", json={})
    d = biz[0].get(f"{API}/my/dashboard", params={"days": 30}).json()
    assert len(d["stats_by_day"]) == 30 and d["totals"]["days"] == 30
    assert d["stats_by_day"][-1]["views"] >= 4 and d["totals"]["views_period"] >= 4
    row = [e for e in d["events"] if e["id"] == eid][0]
    assert row["views"] == 4 and row["views_period"] == 4
    assert len(biz[0].get(f"{API}/my/dashboard").json()["stats_by_day"]) == 7
