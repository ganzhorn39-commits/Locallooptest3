"""Category "Sonstiges" (other) with the host's own short label."""
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


@pytest.fixture(scope="module")
def host():
    s = requests.Session()
    r = s.post(f"{API}/auth/dev-session", json={"alias": f"cathost-{RUN}"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    return s


def _create(s, **extra):
    return s.post(f"{API}/events", json={
        "title": f"TEST_Cat_{RUN}", "category": "other",
        "start_time": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "latitude": 49.0, "longitude": 8.4, "address": "TEST", **extra,
    })


def test_other_category_keeps_own_label(host):
    r = _create(host, category_label="  Kleidertausch   im  Hof ")
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["category"] == "other" and ev["category_label"] == "Kleidertausch im Hof"
    listed = [e for e in requests.get(f"{API}/events").json() if e["id"] == ev["id"]]
    assert listed and listed[0]["category_label"] == "Kleidertausch im Hof"


def test_label_rules(host):
    r = _create(host, category_label="x" * 31)
    assert r.status_code == 400 and r.json()["detail"]["code"] == "category_label_too_long"
    r = _create(host, category_label="Hurensohn-Treff")
    assert r.status_code == 400 and r.json()["detail"]["code"] == "profanity"
    # other categories never carry a label
    r = _create(host, category="food", category_label="Kochkurs")
    assert r.status_code == 200 and r.json()["category_label"] == ""
    # "Sonstiges" without a text is fine
    assert _create(host).json()["category_label"] == ""


def test_edit_label_and_switch_category(host):
    eid = _create(host, category_label="Repair-Café").json()["id"]
    r = host.patch(f"{API}/events/{eid}", json={"category_label": "Reparatur-Treff"})
    assert r.status_code == 200 and r.json()["category_label"] == "Reparatur-Treff"
    r = host.patch(f"{API}/events/{eid}", json={"category": "workshops"})
    assert r.status_code == 200 and r.json()["category_label"] == ""
    r = host.patch(f"{API}/events/{eid}", json={"category": "other", "category_label": "Nähkurs"})
    assert r.status_code == 200 and r.json()["category_label"] == "Nähkurs"
