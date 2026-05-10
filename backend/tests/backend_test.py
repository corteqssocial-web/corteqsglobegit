"""Backend tests for CorteQS Diaspora Globe."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("BACKEND_BASE_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")).rstrip("/")
API = f"{BASE_URL}/api"

TS = int(time.time())
TEST_EMAIL = f"testdiaspora_{TS}@example.com"
TEST_PASSWORD = "test123456"
TEST_NAME = "Test User"

# shared state across tests
state = {}


# ---------- Health ----------
def test_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json() == {"ok": True}


# ---------- Public Pins ----------
def test_pins_list_approved():
    r = requests.get(f"{API}/pins", timeout=15)
    assert r.status_code == 200
    body = r.json()
    pins = body.get("pins") or []
    assert len(pins) >= 25, f"Expected at least 25 pins, got {len(pins)}"
    sample = pins[0]
    for f in ["id", "type", "name", "city", "lat", "lng", "status", "created_at"]:
        assert f in sample, f"missing field {f}"
    for p in pins:
        assert p["status"] == "approved"


# ---------- Auth: unauthenticated me ----------
def test_auth_me_unauthenticated():
    r = requests.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


# ---------- Signup ----------
def test_signup():
    payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": TEST_NAME}
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=30)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["access_token"]
    assert data["user"]["email"] == TEST_EMAIL
    state["access_token"] = data["access_token"]
    state["user_id"] = data["user"]["id"]


# ---------- Login ----------
def test_login():
    if "access_token" not in state:
        pytest.skip("signup failed")
    r = requests.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("access_token")
    state["access_token"] = data["access_token"]


def auth_headers():
    return {"Authorization": f"Bearer {state['access_token']}"}


# ---------- /auth/me ----------
def test_auth_me_authenticated():
    if "access_token" not in state:
        pytest.skip("login failed")
    r = requests.get(f"{API}/auth/me", headers=auth_headers(), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["email"] == TEST_EMAIL


# ---------- Create pin ----------
def test_create_pin():
    if "access_token" not in state:
        pytest.skip("no token")
    payload = {"type": "business", "name": "TEST_Cafe", "city": "Berlin", "hood": "Mitte", "lat": 52.52, "lng": 13.405}
    r = requests.post(f"{API}/pins", json=payload, headers=auth_headers(), timeout=20)
    assert r.status_code == 200, r.text
    pin = r.json()["pin"]
    assert pin["status"] == "pending"
    state["pin_id"] = pin["id"]


def test_pending_pin_not_in_public():
    if "pin_id" not in state:
        pytest.skip("no pin")
    r = requests.get(f"{API}/pins", timeout=15)
    pins = r.json().get("pins", [])
    ids = {p["id"] for p in pins}
    assert state["pin_id"] not in ids, "pending pin should not appear publicly"


def test_pins_mine():
    if "access_token" not in state or "pin_id" not in state:
        pytest.skip("no pin")
    r = requests.get(f"{API}/pins/mine", headers=auth_headers(), timeout=15)
    assert r.status_code == 200, r.text
    pins = r.json()["pins"]
    ids = {p["id"] for p in pins}
    assert state["pin_id"] in ids


# ---------- Geocoding ----------
def test_geocode():
    r = requests.get(f"{API}/geocode", params={"q": "Istanbul"}, timeout=20)
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    assert len(results) > 0
    first = results[0]
    assert "lat" in first and "lng" in first
    assert isinstance(first["lat"], (int, float))


# ---------- Admin guards ----------
def test_admin_pins_no_admin_403():
    if "access_token" not in state:
        pytest.skip("no token")
    r = requests.get(f"{API}/pins/admin", headers=auth_headers(), timeout=15)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_patch_pin_no_admin_403():
    if "access_token" not in state or "pin_id" not in state:
        pytest.skip("no pin")
    r = requests.patch(f"{API}/pins/{state['pin_id']}", json={"status": "approved"}, headers=auth_headers(), timeout=15)
    assert r.status_code == 403


# ---------- Logout ----------
def test_logout():
    r = requests.post(f"{API}/auth/logout", timeout=15)
    assert r.status_code == 200
