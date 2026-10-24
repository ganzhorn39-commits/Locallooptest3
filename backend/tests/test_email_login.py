"""Sign-in with an e-mail code (works as sign-up too) and Apple token checks.
Without RESEND_API_KEY the server only hands out codes in preview mode (ALLOW_DEV_LOGIN), as `dev_code`."""
import os
import uuid
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


def _code(email):
    r = requests.post(f"{API}/auth/email/start", json={"email": email})
    assert r.status_code == 200, r.text
    return r.json().get("dev_code")


def test_methods():
    m = requests.get(f"{API}/auth/methods").json()
    assert m["email"] is True and m["google"] is True


def test_invalid_email():
    r = requests.post(f"{API}/auth/email/start", json={"email": "kein-mail"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "invalid_email"


def test_sign_up_then_sign_in_same_account():
    email = f"Neu.{RUN}@Example.com"
    code = _code(email)
    assert code and len(code) == 6
    r = requests.post(f"{API}/auth/email/verify", json={"email": email, "code": code})
    assert r.status_code == 200, r.text
    user, token = r.json()["user"], r.json()["session_token"]
    assert user["email"] == email.lower() and user["onboarded"] is False and user["email_verified"] is True
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["user_id"] == user["user_id"]
    # used code can't be used again; a new code logs into the same account
    assert requests.post(f"{API}/auth/email/verify", json={"email": email, "code": code}).status_code == 400
    r = requests.post(f"{API}/auth/email/verify", json={"email": email, "code": _code(email)})
    assert r.json()["user"]["user_id"] == user["user_id"]


def test_wrong_code_and_try_limit():
    email = f"tries.{RUN}@example.com"
    code = _code(email)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        r = requests.post(f"{API}/auth/email/verify", json={"email": email, "code": wrong})
        assert r.status_code == 400 and r.json()["detail"]["code"] == "wrong_code"
    r = requests.post(f"{API}/auth/email/verify", json={"email": email, "code": code})
    assert r.status_code == 429  # even the right code is locked after 5 wrong tries


def test_code_rate_limit():
    email = f"spam.{RUN}@example.com"
    for _ in range(5):
        _code(email)
    r = requests.post(f"{API}/auth/email/start", json={"email": email})
    assert r.status_code == 429


def test_apple_rejects_bad_token():
    r = requests.post(f"{API}/auth/apple", json={"identity_token": "not.a.token"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "apple_invalid"
