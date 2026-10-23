"""Business offers ("Deals") on events.
Covers: only business accounts can attach an offer, claiming (attendees only, one per person, total limit,
hosts excluded), my deals, check-out returns an unused deal, redeeming by code (host only, once),
editing the offer, cancelled/past events, dashboard numbers and account deletion.
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


def _session(alias: str, business: bool = False):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/dev-session", json={"alias": alias})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    if business:
        s.patch(f"{API}/profile", json={"account_type": "business", "business_name": f"TEST Café {RUN}", "onboarded": True})
    return s, r.json()["user"]["user_id"]


def _event(sess, title, **extra):
    return sess.post(f"{API}/events", json={
        "title": title, "category": "cafe", "start_time": SOON,
        "latitude": 49.0, "longitude": 8.4, "address": "TEST", **extra,
    })


def _checkin(sess, eid):
    r = sess.post(f"{API}/events/{eid}/checkin", json={"visibility": "public"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def biz():
    return _session(f"dealbiz-{RUN}", business=True)


@pytest.fixture(scope="module")
def guests():
    return [_session(f"dealguest{i}-{RUN}") for i in range(4)]


@pytest.fixture(scope="module")
def event_id(biz):
    r = _event(biz[0], f"TEST_Deal_{RUN}", offer_title="  10 % auf Kaffee  ", offer_limit=2)
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["offer_title"] == "10 % auf Kaffee" and e["offer_limit"] == 2 and e["offer_claimed"] == 0
    return e["id"]


class TestOffers:
    def test_only_business_can_add_offer(self):
        user, _ = _session(f"dealuser-{RUN}")
        assert _event(user, f"TEST_NoDeal_{RUN}", offer_title="Freibier").status_code == 403
        r = _event(user, f"TEST_NoDeal_{RUN}")
        assert r.status_code == 200 and r.json()["offer_title"] == ""
        # ...and can't sneak one in later
        assert user.patch(f"{API}/events/{r.json()['id']}", json={"offer_title": "Freibier"}).status_code == 403

    def test_offer_text_length(self, biz):
        assert _event(biz[0], f"TEST_Long_{RUN}", offer_title="x" * 81).status_code == 400

    def test_claim_requires_checkin(self, guests, event_id):
        r = guests[0][0].post(f"{API}/events/{event_id}/deal")
        assert r.status_code == 403

    def test_host_cannot_claim_own_offer(self, biz, event_id):
        _checkin(biz[0], event_id)
        assert biz[0].post(f"{API}/events/{event_id}/deal").status_code == 403
        _checkin(biz[0], event_id)  # leave again

    def test_claim_once_per_person(self, guests, event_id):
        g, _ = guests[0]
        _checkin(g, event_id)
        r = g.post(f"{API}/events/{event_id}/deal")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "active" and d["offer_title"] == "10 % auf Kaffee"
        assert len(d["code"]) == 8 and d["qr"] == "LOCALLOOP-DEAL:" + d["code"]
        again = g.post(f"{API}/events/{event_id}/deal").json()
        assert again["already"] is True and again["code"] == d["code"]
        assert g.get(f"{API}/events/{event_id}/deal").json()["deal"]["code"] == d["code"]

    def test_total_limit(self, guests, event_id):
        _checkin(guests[1][0], event_id)
        assert guests[1][0].post(f"{API}/events/{event_id}/deal").status_code == 200
        _checkin(guests[2][0], event_id)
        r = guests[2][0].post(f"{API}/events/{event_id}/deal")
        assert r.status_code == 409 and "sold out" in r.text
        assert requests.get(f"{API}/events/{event_id}").json()["offer_claimed"] == 2
        assert guests[2][0].get(f"{API}/events/{event_id}/deal").json()["deal"] is None

    def test_checkout_returns_unused_deal(self, guests, event_id):
        _checkin(guests[1][0], event_id)  # guest 1 leaves the event
        assert guests[1][0].get(f"{API}/events/{event_id}/deal").json()["deal"] is None
        assert requests.get(f"{API}/events/{event_id}").json()["offer_claimed"] == 1
        assert guests[2][0].post(f"{API}/events/{event_id}/deal").status_code == 200  # now there is one left

    def test_my_deals(self, guests, event_id):
        deals = guests[0][0].get(f"{API}/my/deals").json()
        assert len(deals) == 1
        d = deals[0]
        assert d["event_title"] == f"TEST_Deal_{RUN}" and d["business_name"] == f"TEST Café {RUN}"
        assert d["status"] == "active"

    def test_redeem(self, biz, guests, event_id):
        code = guests[0][0].get(f"{API}/events/{event_id}/deal").json()["deal"]["code"]
        assert guests[3][0].post(f"{API}/deals/redeem", json={"code": code}).status_code == 403
        assert biz[0].post(f"{API}/deals/redeem", json={"code": "NOPE1234"}).status_code == 404
        # QR payload, lower case and dashes are all accepted
        messy = f"localloop-deal:{code[:4].lower()}-{code[4:]}"
        r = biz[0].post(f"{API}/deals/redeem", json={"code": messy})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "redeemed" and r.json()["guest_name"].startswith("Demo dealguest0")
        r2 = biz[0].post(f"{API}/deals/redeem", json={"code": code})
        assert r2.status_code == 409 and r2.json()["detail"]["reason"] == "redeemed"
        assert guests[0][0].get(f"{API}/my/deals").json()[0]["status"] == "redeemed"

    def test_redeemed_deal_survives_checkout(self, guests, event_id):
        _checkin(guests[0][0], event_id)  # leave after using the deal
        d = guests[0][0].get(f"{API}/events/{event_id}/deal").json()["deal"]
        assert d is not None and d["status"] == "redeemed"
        assert requests.get(f"{API}/events/{event_id}").json()["offer_claimed"] == 2

    def test_dashboard_numbers(self, biz, event_id):
        dash = biz[0].get(f"{API}/my/dashboard").json()
        row = next(e for e in dash["events"] if e["id"] == event_id)
        assert row["offer_title"] == "10 % auf Kaffee" and row["offer_limit"] == 2
        assert row["deals_claimed"] == 2 and row["deals_redeemed"] == 1
        assert dash["totals"]["deals_claimed"] >= 2 and dash["totals"]["deals_redeemed"] >= 1
        assert dash["totals"]["offers"] >= 1

    def test_edit_offer(self, biz, guests, event_id):
        assert biz[0].patch(f"{API}/events/{event_id}", json={"offer_limit": 1}).status_code == 409
        r = biz[0].patch(f"{API}/events/{event_id}", json={"offer_title": "20 % auf alles", "offer_limit": 5})
        assert r.status_code == 200 and r.json()["offer_title"] == "20 % auf alles"
        # already claimed deals keep the text they were claimed with
        assert guests[2][0].get(f"{API}/events/{event_id}/deal").json()["deal"]["offer_title"] == "10 % auf Kaffee"

    def test_cancelled_event(self, biz, guests, event_id):
        code = guests[2][0].get(f"{API}/events/{event_id}/deal").json()["deal"]["code"]
        assert biz[0].post(f"{API}/events/{event_id}/cancel").status_code == 200
        assert guests[2][0].get(f"{API}/my/deals").json()[0]["status"] == "cancelled"
        r = biz[0].post(f"{API}/deals/redeem", json={"code": code})
        assert r.status_code == 409 and r.json()["detail"]["reason"] == "cancelled"
        assert guests[3][0].post(f"{API}/events/{event_id}/deal").status_code in (403, 409)

    def test_past_event_offer_not_claimable(self, biz, guests):
        r = _event(biz[0], f"TEST_PastDeal_{RUN}", start_time="2020-01-01T18:00:00+00:00", offer_title="Gratis Keks")
        eid = r.json()["id"]
        _checkin(guests[3][0], eid)
        r = guests[3][0].post(f"{API}/events/{eid}/deal")
        assert r.status_code == 409 and "over" in r.text

    def test_account_deletion(self, biz):
        eid = _event(biz[0], f"TEST_DelDeal_{RUN}", offer_title="Gratis Espresso", offer_limit=10).json()["id"]
        a, _ = _session(f"dealdel-a-{RUN}")
        b, _ = _session(f"dealdel-b-{RUN}")
        for s in (a, b):
            _checkin(s, eid)
            assert s.post(f"{API}/events/{eid}/deal").status_code == 200
        code_b = b.get(f"{API}/events/{eid}/deal").json()["deal"]["code"]
        assert biz[0].post(f"{API}/deals/redeem", json={"code": code_b}).status_code == 200
        assert a.delete(f"{API}/profile").status_code == 200  # unused deal goes back
        assert b.delete(f"{API}/profile").status_code == 200  # used deal stays, anonymised
        row = next(e for e in biz[0].get(f"{API}/my/dashboard").json()["events"] if e["id"] == eid)
        assert row["deals_claimed"] == 1 and row["deals_redeemed"] == 1
        assert requests.get(f"{API}/events/{eid}").json()["offer_claimed"] == 1
