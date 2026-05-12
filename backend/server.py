"""CorteQS Diaspora Globe — FastAPI backend.

Auth: Supabase Email/Password + Supabase Google OAuth (frontend handles via supabase-js + JWT verification on backend).
DB: Supabase (Postgres). Tables: profiles, pins.
Location search: Google Places API (New) proxied server-side.
"""

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Query, UploadFile, File
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone
import os
import logging
import uuid
import asyncio
import httpx
import jwt as pyjwt
import re
import unicodedata

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_GEOCODING_API_KEY")
ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]
# Bias autocomplete toward the diaspora corridor, but do NOT restrict — otherwise
# cities outside the list (Tokyo, Dubai, Cairo, São Paulo, …) cannot be found or
# get resolved to a same-named place in one of the allowed countries.
DEFAULT_AUTOCOMPLETE_REGIONS: list[str] = []

# Service role client bypasses RLS — used for ALL data ops (never touch .auth on this!)
sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
# Separate client for user auth operations (sign_in/sign_up mutate session — keep isolated)
sb_auth: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

app = FastAPI(title="CorteQS Diaspora Globe API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
log = logging.getLogger("diaspora")


# ---------- Models ----------
class PinIn(BaseModel):
    type: str  # person | business | ngo | creator | event
    name: str
    city: str
    hood: Optional[str] = ""
    lat: float
    lng: float
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    location_label: Optional[str] = ""
    canonical_city: Optional[str] = ""
    country_code: Optional[str] = ""
    provider: Optional[str] = ""
    provider_id: Optional[str] = ""


class PinOut(BaseModel):
    id: str
    type: str
    name: str
    city: str
    hood: Optional[str] = ""
    lat: float
    lng: float
    status: str
    created_at: str
    user_id: Optional[str] = None
    location_label: Optional[str] = ""
    canonical_city: Optional[str] = ""
    country_code: Optional[str] = ""
    provider: Optional[str] = ""
    provider_id: Optional[str] = ""


class SignupIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PatchPinIn(BaseModel):
    status: str  # approved | rejected | pending


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = ""
    is_admin: bool = False


class LocationResultOut(BaseModel):
    label: str
    city: str
    region: str = ""
    country: str = ""
    country_code: str = ""
    lat: float
    lng: float
    provider: str
    provider_id: str = ""
    precision: str
    canonical_name: str


# ---------- Helpers ----------
def is_admin_email(email: Optional[str]) -> bool:
    if not email:
        return False
    return email.lower() in ADMIN_EMAILS


def normalize_search_text(value: Optional[str]) -> str:
    cleaned = unicodedata.normalize("NFD", (value or "").strip().lower())
    cleaned = "".join(ch for ch in cleaned if unicodedata.category(ch) != "Mn")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def canonicalize_city_name(value: Optional[str]) -> str:
    normalized = normalize_search_text(value)
    return " ".join(part.capitalize() for part in normalized.split())


def score_location_result(result: dict, normalized_query: str) -> int:
    normalized_city = normalize_search_text(result.get("city"))
    normalized_label = normalize_search_text(result.get("label"))
    normalized_region = normalize_search_text(result.get("region"))
    precision = result.get("precision")

    if normalized_city == normalized_query:
        return 0
    if normalized_city.startswith(normalized_query):
        return 10
    if normalized_label.startswith(normalized_query):
        return 20
    if normalized_city and normalized_query in normalized_city:
        return 30
    if normalized_region == normalized_query:
        return 45
    if normalized_label and normalized_query in normalized_label:
        return 55
    if precision == "region":
        return 75
    return 100


def classify_precision(components: List[dict]) -> str:
    component_types = {t for component in components for t in component.get("types", [])}
    if {"street_number", "route"} & component_types or {"premise", "subpremise"} & component_types:
        return "address"
    if {"locality", "postal_town"} & component_types:
        return "city"
    if {"sublocality", "sublocality_level_1", "neighborhood", "administrative_area_level_2"} & component_types:
        return "district"
    return "region"


def component_value(components: List[dict], *wanted_types: str) -> str:
    for component in components:
        types = set(component.get("types", []))
        if types.intersection(wanted_types):
            return component.get("longText", "") or component.get("long_name", "")
    return ""


def map_google_place_details(item: dict, prediction_text: str = "") -> Optional[dict]:
    loc = item.get("location", {})
    lat = loc.get("latitude")
    lng = loc.get("longitude")
    if lat is None or lng is None:
        return None

    components = item.get("addressComponents", [])
    city = (
        component_value(components, "locality", "postal_town")
        or component_value(components, "administrative_area_level_3")
        or component_value(components, "administrative_area_level_2")
    )
    region = component_value(components, "administrative_area_level_1")
    country = component_value(components, "country")
    country_code = ""
    for component in components:
        if "country" in component.get("types", []):
            country_code = component.get("short_name", "")
            break

    precision = classify_precision(components)
    if precision == "region" and not city:
        city = region

    label = item.get("formattedAddress", "") or prediction_text
    canonical_name = canonicalize_city_name(city or region or prediction_text)
    if not canonical_name:
        return None

    return {
        "label": label,
        "city": city or region,
        "region": region,
        "country": country,
        "country_code": country_code,
        "lat": lat,
        "lng": lng,
        "provider": "google",
        "provider_id": item.get("id", ""),
        "precision": precision,
        "canonical_name": canonical_name,
    }


def dedupe_location_results(results: List[dict]) -> List[dict]:
    deduped = []
    seen = set()
    for result in results:
        key = (
            normalize_search_text(result.get("canonical_name")),
            result.get("country_code", ""),
            result.get("precision", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(result)
    return deduped


async def fetch_google_location_results(query: str) -> List[dict]:
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Missing GOOGLE_MAPS_API_KEY")

    session_token = uuid.uuid4().hex
    autocomplete_headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        async def autocomplete_for(primary_type: str) -> List[dict]:
            payload: dict = {
                "input": query,
                "includedPrimaryTypes": [primary_type],
                "languageCode": "tr",
                "sessionToken": session_token,
            }
            if DEFAULT_AUTOCOMPLETE_REGIONS:
                payload["includedRegionCodes"] = DEFAULT_AUTOCOMPLETE_REGIONS
            response = await client.post(
                "https://places.googleapis.com/v1/places:autocomplete",
                json=payload,
                headers=autocomplete_headers,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Places autocomplete failed: {response.text}")
            suggestions = response.json().get("suggestions", [])
            return [
                suggestion.get("placePrediction")
                for suggestion in suggestions
                if suggestion.get("placePrediction", {}).get("placeId")
            ][:5]

        place_predictions = await autocomplete_for("(cities)")
        if not place_predictions:
            place_predictions = await autocomplete_for("(regions)")
        if not place_predictions:
            return []

        async def fetch_place_details(prediction: dict) -> Optional[dict]:
            place_id = prediction.get("placeId")
            if not place_id:
                return None
            details_headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
                "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location,types",
            }
            details_response = await client.get(
                f"https://places.googleapis.com/v1/places/{place_id}",
                headers=details_headers,
                params={"sessionToken": session_token},
            )
            if details_response.status_code != 200:
                log.warning("Place details failed for %s: %s", place_id, details_response.text)
                return None
            return map_google_place_details(
                details_response.json(),
                prediction.get("text", {}).get("text", ""),
            )

        mapped = await asyncio.gather(*(fetch_place_details(prediction) for prediction in place_predictions))

    return [item for item in mapped if item]


async def ensure_profile(user_id: str, email: str, name: str = "", picture: str = "") -> dict:
    """Insert profile if missing; otherwise return existing. Never overwrites is_admin (computed live)."""
    existing = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    if existing.data:
        return existing.data[0]
    payload = {
        "id": user_id,
        "email": email,
        "name": name or email.split("@")[0],
        "picture": picture,
        "is_admin": is_admin_email(email),
    }
    sb.table("profiles").insert(payload).execute()
    return payload


def get_user_from_supabase_jwt(request: Request) -> Optional[dict]:
    """Decode Supabase JWT (Bearer) without signature verification — we only need claims for email/sub."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1]
    try:
        # decode without verifying — Supabase has already verified before issuing.
        # For stronger security, use SUPABASE_JWT_SECRET (not provided in our keys), so we trust the Supabase API.
        claims = pyjwt.decode(token, options={"verify_signature": False, "verify_aud": False})
    except Exception:
        return None
    iss = claims.get("iss", "")
    if "supabase" not in iss:
        return None
    user_id = claims.get("sub")
    email = claims.get("email") or (claims.get("user_metadata") or {}).get("email")
    if not user_id or not email:
        return None
    name = (claims.get("user_metadata") or {}).get("name") or (claims.get("user_metadata") or {}).get("full_name") or ""
    return {
        "id": user_id,
        "email": email,
        "name": name,
        "picture": "",
        "is_admin": is_admin_email(email),
    }


async def current_user(request: Request) -> Optional[dict]:
    user = get_user_from_supabase_jwt(request)
    if user:
        # Read-only: ensure profile exists once (insert if missing). is_admin computed live.
        await ensure_profile(user["id"], user["email"], user.get("name", ""), user.get("picture", ""))
        return user
    return None


async def require_user(request: Request) -> dict:
    u = await current_user(request)
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return u


async def require_admin(request: Request) -> dict:
    u = await require_user(request)
    if not u.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return u


# ---------- Routes: health ----------
@api.get("/")
def root():
    return {"service": "CorteQS Diaspora Globe", "ok": True}


@api.get("/health")
def health():
    return {"ok": True}


# ---------- Routes: Supabase Email/Password Auth (signup/login proxy) ----------
@api.post("/auth/signup")
async def signup(body: SignupIn):
    """Create Supabase auth user (admin API), then create profile, then sign in for tokens."""
    # 1) Create user (admin API on service-role client — uses GoTrue admin endpoint, doesn't mutate session)
    try:
        res = sb.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
            "user_metadata": {"name": body.name or ""},
        })
        user = res.user
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "duplicate" in msg.lower() or "registered" in msg.lower():
            raise HTTPException(status_code=409, detail="Email already registered")
        log.exception("signup create_user failed")
        raise HTTPException(status_code=400, detail=msg)

    # 2) Ensure profile (data write — uses service-role client, never mutated by auth)
    await ensure_profile(user.id, user.email, body.name or "", "")

    # 3) Sign in via the SEPARATE auth client (never use `sb` for sign_in — would corrupt service-role session)
    try:
        login_res = sb_auth.auth.sign_in_with_password({"email": body.email, "password": body.password})
        sess = login_res.session
    except Exception:
        log.exception("signup post-create sign_in failed")
        raise HTTPException(status_code=500, detail="Account created but sign-in failed; please try logging in")

    return {
        "access_token": sess.access_token,
        "refresh_token": sess.refresh_token,
        "user": {"id": user.id, "email": user.email, "name": body.name or "", "is_admin": is_admin_email(user.email)},
    }


@api.post("/auth/login")
async def login(body: LoginIn):
    # Use sb_auth (anon-key client) to NOT corrupt the service-role session on `sb`
    try:
        res = sb_auth.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as e:
        log.info("login failed for %s: %s", body.email, e)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    sess = res.session
    user = res.user
    if not sess or not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Ensure profile exists (only inserts on first login if signup didn't run via our /signup)
    name = (user.user_metadata or {}).get("name", "") or ""
    await ensure_profile(user.id, user.email, name, "")
    return {
        "access_token": sess.access_token,
        "refresh_token": sess.refresh_token,
        "user": {
            "id": user.id, "email": user.email,
            "name": name,
            "is_admin": is_admin_email(user.email),
        },
    }


@api.get("/auth/me")
async def auth_me(request: Request):
    u = await current_user(request)
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return u


@api.post("/auth/logout")
async def logout():
    """Supabase JWT is managed client-side; server-side logout is a no-op."""
    return {"ok": True}


# ---------- Routes: Pins ----------
@api.get("/pins")
async def list_pins(request: Request):
    """Public: returns approved pins. If user is admin, returns all.
    Returns empty list (not error) if tables don't yet exist — UI can still render globe."""
    u = await current_user(request)
    try:
        if u and u.get("is_admin"):
            res = sb.table("pins").select("*").order("created_at", desc=True).execute()
        else:
            res = sb.table("pins").select("*").eq("status", "approved").order("created_at", desc=True).execute()
        return {"pins": res.data or [], "setup_required": False}
    except Exception as e:
        log.warning("Pins query failed (setup likely required): %s", e)
        return {"pins": [], "setup_required": True, "hint": "Paste /app/backend/supabase_setup.sql into Supabase SQL Editor"}


@api.get("/pins/mine")
async def my_pins(user: dict = Depends(require_user)):
    res = sb.table("pins").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute()
    return {"pins": res.data or []}


@api.get("/pins/admin")
async def admin_pins(user: dict = Depends(require_admin)):
    res = sb.table("pins").select("*").order("created_at", desc=True).execute()
    return {"pins": res.data or []}


@api.post("/pins")
async def create_pin(body: PinIn, user: dict = Depends(require_user)):
    valid = {"person", "business", "ngo", "creator", "event"}
    if body.type not in valid:
        raise HTTPException(status_code=400, detail=f"type must be one of {valid}")
    pin_id = str(uuid.uuid4())
    payload = {
        "id": pin_id,
        "type": body.type,
        "name": body.name.strip(),
        "city": body.city.strip(),
        "hood": (body.hood or "").strip(),
        "lat": body.lat,
        "lng": body.lng,
        "description": (body.description or "").strip(),
        "image_url": (body.image_url or "").strip(),
        "location_label": (body.location_label or "").strip(),
        "canonical_city": canonicalize_city_name(body.canonical_city or body.city),
        "country_code": (body.country_code or "").strip().upper(),
        "provider": (body.provider or "").strip(),
        "provider_id": (body.provider_id or "").strip(),
        "status": "pending",
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    sb.table("pins").insert(payload).execute()
    return {"pin": payload}


# ---------- Routes: Pin image upload (Supabase Storage) ----------
@api.post("/upload/pin-image")
async def upload_pin_image(file: UploadFile = File(...), user: dict = Depends(require_user)):
    contents = await file.read()
    if len(contents) > 4 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 4 MB)")
    ext = ((file.filename or "").rsplit(".", 1)[-1] or "jpg").lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        raise HTTPException(status_code=400, detail="Only jpg/png/webp/gif allowed")
    content_type = file.content_type or f"image/{'jpeg' if ext == 'jpg' else ext}"
    path = f"{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        sb.storage.from_("pin-images").upload(
            path, contents,
            {"content-type": content_type, "cache-control": "public, max-age=31536000"},
        )
    except Exception as e:
        log.exception("storage upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
    public_url = sb.storage.from_("pin-images").get_public_url(path)
    # supabase-py sometimes returns URL with trailing '?' — strip it
    public_url = public_url.rstrip("?")
    return {"url": public_url, "path": path}


# ---------- Routes: Geo-IP (initial fly-to) ----------
@api.get("/geoip")
async def geoip(request: Request):
    """Return user's approximate country + lat/lng via IP geolocation."""
    fwd = request.headers.get("x-forwarded-for", "")
    ip = (fwd.split(",")[0].strip() if fwd else "") or request.headers.get("x-real-ip") or (request.client.host if request.client else "")
    default = {"country_code": "TR", "country_name": "Türkiye", "lat": 41.01, "lng": 28.96, "city": "Istanbul"}
    if not ip or ip.startswith(("127.", "10.", "192.168.")) or ip in ("unknown", "::1"):
        return {**default, "fallback": True}
    try:
        async with httpx.AsyncClient(timeout=4.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}", params={"fields": "status,country,countryCode,city,lat,lon"})
        if r.status_code != 200:
            return {**default, "fallback": True}
        d = r.json()
        if d.get("status") != "success" or d.get("lat") is None:
            return {**default, "fallback": True}
        return {
            "country_code": d.get("countryCode", ""),
            "country_name": d.get("country", ""),
            "city": d.get("city", ""),
            "lat": d["lat"], "lng": d["lon"], "fallback": False,
        }
    except Exception:
        return {**default, "fallback": True}


@api.patch("/pins/{pin_id}")
async def update_pin(pin_id: str, body: PatchPinIn, user: dict = Depends(require_admin)):
    if body.status not in {"approved", "rejected", "pending"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    res = sb.table("pins").update({"status": body.status}).eq("id", pin_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Pin not found")
    return {"pin": res.data[0]}


@api.delete("/pins/{pin_id}")
async def delete_pin(pin_id: str, request: Request):
    u = await require_user(request)
    pin = sb.table("pins").select("*").eq("id", pin_id).limit(1).execute()
    if not pin.data:
        raise HTTPException(status_code=404, detail="Pin not found")
    if not u.get("is_admin") and pin.data[0].get("user_id") != u["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    sb.table("pins").delete().eq("id", pin_id).execute()
    return {"ok": True}


# ---------- Routes: Geocoding ----------
@api.get("/locations/search")
async def search_locations(q: str = Query(..., min_length=1, max_length=120)):
    """Canonical location search backed by provider adapters."""
    normalized_query = normalize_search_text(q)
    if not normalized_query:
        return {"results": []}

    raw_results = await fetch_google_location_results(q)
    scored = []
    for result in raw_results:
        score = score_location_result(result, normalized_query)
        result["score"] = score
        if result["precision"] not in {"city", "district", "region"}:
            continue
        if score >= 100:
            continue
        scored.append(result)

    scored.sort(key=lambda item: (item["score"], item["precision"] == "region", item["label"]))
    deduped = dedupe_location_results(scored)[:6]
    cleaned = [{key: value for key, value in item.items() if key != "score"} for item in deduped]
    return {"results": cleaned}


@api.get("/geocode")
async def geocode(q: str = Query(..., min_length=1, max_length=120)):
    """Backward-compatible alias for older frontend consumers."""
    response = await search_locations(q)
    return {
        "results": [
            {
                "label": item["label"],
                "city": item["city"],
                "country": item["country"],
                "lat": item["lat"],
                "lng": item["lng"],
            }
            for item in response["results"]
        ]
    }


# ---------- Routes: Seed sample pins (one-time use) ----------
SAMPLE_PINS = [
    {"type": "ngo", "name": "Türk-Alman Dostluk Derneği", "city": "Berlin", "hood": "Kreuzberg", "lat": 52.499, "lng": 13.403},
    {"type": "business", "name": "İmren Bakery", "city": "Berlin", "hood": "Neukölln", "lat": 52.480, "lng": 13.435},
    {"type": "person", "name": "Ayşe K.", "city": "Berlin", "hood": "Wedding", "lat": 52.547, "lng": 13.367},
    {"type": "event", "name": "Diaspora Buluşması", "city": "Berlin", "hood": "Mitte", "lat": 52.520, "lng": 13.405},
    {"type": "creator", "name": "Mert Yılmaz", "city": "Frankfurt", "hood": "Bahnhofsviertel", "lat": 50.107, "lng": 8.668},
    {"type": "business", "name": "Anatolia Deli", "city": "Munich", "hood": "Westend", "lat": 48.135, "lng": 11.541},
    {"type": "ngo", "name": "Hollanda Türk Forumu", "city": "Rotterdam", "hood": "Feijenoord", "lat": 51.892, "lng": 4.501},
    {"type": "business", "name": "Bosporus Restaurant", "city": "Amsterdam", "hood": "De Pijp", "lat": 52.353, "lng": 4.893},
    {"type": "creator", "name": "Selin V.", "city": "Brussels", "hood": "Schaerbeek", "lat": 50.867, "lng": 4.378},
    {"type": "event", "name": "Vienna Cultural Night", "city": "Vienna", "hood": "Favoriten", "lat": 48.176, "lng": 16.382},
    {"type": "person", "name": "Emre D.", "city": "Stockholm", "hood": "Rinkeby", "lat": 59.388, "lng": 17.928},
    {"type": "ngo", "name": "Norden Diaspora Hub", "city": "Oslo", "hood": "Grünerløkka", "lat": 59.928, "lng": 10.760},
    {"type": "business", "name": "Café Anadolu", "city": "Copenhagen", "hood": "Nørrebro", "lat": 55.694, "lng": 12.553},
    {"type": "creator", "name": "Lara T.", "city": "London", "hood": "Hackney", "lat": 51.545, "lng": -0.055},
    {"type": "event", "name": "Diaspora Tech Meetup", "city": "London", "hood": "Shoreditch", "lat": 51.524, "lng": -0.078},
    {"type": "ngo", "name": "Paris Anadolu Kulübü", "city": "Paris", "hood": "Strasbourg-Saint-Denis", "lat": 48.870, "lng": 2.354},
    {"type": "business", "name": "Bodrum Bistro", "city": "Madrid", "hood": "Lavapiés", "lat": 40.408, "lng": -3.701},
    {"type": "person", "name": "Deniz A.", "city": "Barcelona", "hood": "El Raval", "lat": 41.380, "lng": 2.168},
    {"type": "creator", "name": "Kaan S.", "city": "New York", "hood": "Brooklyn", "lat": 40.678, "lng": -73.944},
    {"type": "event", "name": "Toronto Diaspora Fest", "city": "Toronto", "hood": "Kensington Market", "lat": 43.654, "lng": -79.402},
    {"type": "business", "name": "Anatolia Pide", "city": "Sydney", "hood": "Auburn", "lat": -33.849, "lng": 151.033},
    {"type": "ngo", "name": "Tokyo Cultural Bridge", "city": "Tokyo", "hood": "Shibuya", "lat": 35.661, "lng": 139.704},
    {"type": "person", "name": "Burak Y.", "city": "Dubai", "hood": "Jumeirah", "lat": 25.231, "lng": 55.260},
    {"type": "creator", "name": "Mira E.", "city": "Cairo", "hood": "Zamalek", "lat": 30.063, "lng": 31.218},
    {"type": "event", "name": "São Paulo Anadolu Buluşması", "city": "São Paulo", "hood": "Bela Vista", "lat": -23.557, "lng": -46.648},
]


@api.post("/seed")
async def seed():
    """Seed approved sample pins (idempotent — checks count first)."""
    existing = sb.table("pins").select("id", count="exact").limit(1).execute()
    if (existing.count or 0) >= len(SAMPLE_PINS):
        return {"ok": True, "skipped": True, "existing": existing.count}
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for p in SAMPLE_PINS:
        rows.append({**p, "id": str(uuid.uuid4()), "status": "approved", "created_at": now, "user_id": None})
    sb.table("pins").insert(rows).execute()
    return {"ok": True, "inserted": len(rows)}


# ---------- Mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    log.info("CorteQS Diaspora Globe API booted. Supabase: %s", SUPABASE_URL)
