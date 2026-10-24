"""Phase 1-2 tests: 13 events, categories, ratings/capacity, reviews (403 without check-in),
profile birthdate + business auto-verify, auth/me contains onboarding fields."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://map-events-hub.preview.emergentagent.com").rstrip("/")

EXPECTED_CATS = {"sports", "nightlife", "rooftop", "food", "arts",
                 "networking", "gaming", "outdoor", "workshops", "music"}


@pytest.fixture(scope="module")
def session_token():
    r = requests.post(f"{BASE_URL}/api/auth/dev-session", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def auth_headers(session_token):
    return {"Authorization": f"Bearer {session_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def events():
    r = requests.get(f"{BASE_URL}/api/events", timeout=15)
    assert r.status_code == 200
    return r.json()


# ---------------- Phase 1: 13 events, 10 categories ----------------

class TestSeedAndCategories:
    @pytest.mark.skip(reason="veraltet: Seed zählt jetzt nur Demo-Lokale, Tests legen eigene Events an")
    def test_13_events(self, events):
        assert len(events) == 13, f"expected 13 seeded events, got {len(events)}"

    def test_all_10_categories_present(self, events):
        cats = {e["category"] for e in events}
        assert EXPECTED_CATS.issubset(cats), f"missing categories: {EXPECTED_CATS - cats}"

    def test_events_have_rating_and_capacity(self, events):
        for e in events:
            assert "rating" in e and isinstance(e["rating"], (int, float)), e["title"]
            assert "rating_count" in e and isinstance(e["rating_count"], int), e["title"]
            assert "capacity" in e and isinstance(e["capacity"], int), e["title"]
            assert "spots_taken" in e and isinstance(e["spots_taken"], int), e["title"]

    @pytest.mark.skip(reason="veraltet: Tests legen eigene Events außerhalb Karlsruhes an")
    def test_events_are_karlsruhe(self, events):
        for e in events:
            assert "Karlsruhe" in (e.get("address") or ""), e["title"]

    def test_no_mongo_id_leak(self, events):
        for e in events:
            assert "_id" not in e


# ---------------- Phase 2: Reviews ----------------

class TestReviews:
    def test_reviews_get_public(self, events):
        eid = events[0]["id"]
        r = requests.get(f"{BASE_URL}/api/events/{eid}/reviews", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_review_requires_auth(self, events):
        eid = events[0]["id"]
        r = requests.post(f"{BASE_URL}/api/events/{eid}/reviews",
                          json={"rating": 5, "comment": "great"})
        assert r.status_code == 401

    def test_review_requires_checkin_403(self, events, auth_headers):
        # Find an event demo user is NOT checked into. Use last event, then unsave.
        eid = events[-1]["id"]
        status = requests.get(
            f"{BASE_URL}/api/events/{eid}/checkin-status", headers=auth_headers
        ).json()
        if status.get("checked_in"):
            requests.post(f"{BASE_URL}/api/events/{eid}/checkin", headers=auth_headers)
        r = requests.post(
            f"{BASE_URL}/api/events/{eid}/reviews",
            json={"rating": 4, "comment": "TEST_no_checkin"},
            headers=auth_headers,
        )
        assert r.status_code == 403, r.text

    def test_review_post_after_checkin_and_recompute(self, events, auth_headers):
        eid = events[0]["id"]
        # Ensure checked in
        st = requests.get(
            f"{BASE_URL}/api/events/{eid}/checkin-status", headers=auth_headers
        ).json()
        if not st.get("checked_in"):
            r0 = requests.post(f"{BASE_URL}/api/events/{eid}/checkin", headers=auth_headers)
            assert r0.status_code == 200
        before = requests.get(f"{BASE_URL}/api/events/{eid}", timeout=15).json()
        base_count = before["rating_count"]

        r = requests.post(
            f"{BASE_URL}/api/events/{eid}/reviews",
            json={"rating": 5, "comment": "TEST_phase12 review"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["review"]["rating"] == 5

        after = requests.get(f"{BASE_URL}/api/events/{eid}", timeout=15).json()
        # Upserted per user so count should be base_count + 1 the first time, or same on retry
        assert after["rating_count"] >= base_count

        listed = requests.get(f"{BASE_URL}/api/events/{eid}/reviews", timeout=15).json()
        assert any(x["comment"] == "TEST_phase12 review" for x in listed)

    def test_review_rating_clamped(self, events, auth_headers):
        eid = events[0]["id"]
        # Already checked in from previous test
        r = requests.post(
            f"{BASE_URL}/api/events/{eid}/reviews",
            json={"rating": 99, "comment": "TEST_clamp"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["review"]["rating"] == 5


# ---------------- Phase 2: Profile (birthdate / account_type / business auto-verify) ----------------

class TestProfile:
    def test_profile_requires_auth(self):
        r = requests.patch(f"{BASE_URL}/api/profile", json={"name": "x"})
        assert r.status_code == 401

    def test_profile_birthdate_and_user_type(self, auth_headers):
        r = requests.patch(
            f"{BASE_URL}/api/profile",
            json={
                "name": "Demo Explorer",
                "birthdate": "2000-05-15",
                "account_type": "user",
                "onboarded": True,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["birthdate"] == "2000-05-15"
        assert u["account_type"] == "user"
        assert u["onboarded"] is True

        me = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers).json()
        assert me["birthdate"] == "2000-05-15"
        assert me["account_type"] == "user"
        assert me["onboarded"] is True

    def test_business_auto_verified(self, auth_headers):
        r = requests.patch(
            f"{BASE_URL}/api/profile",
            json={
                "account_type": "business",
                "business_name": "TEST_PhaseBiz",
                "business_category": "food",
                "business_address": "TEST addr",
                "onboarded": True,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["account_type"] == "business"
        assert u["business_name"] == "TEST_PhaseBiz"
        assert u.get("verified") is True, "business with business_name should auto-verify"

        # Reset back to user for other tests (do NOT clear verified — server only sets True)
        requests.patch(
            f"{BASE_URL}/api/profile",
            json={"account_type": "user", "onboarded": True},
            headers=auth_headers,
        )
