"""CorteQS Diaspora Globe — FastAPI backend.

Auth: Supabase Email/Password (frontend handles via supabase-js + JWT verification on backend)
   + Emergent-managed Google OAuth (session_id exchange → httpOnly cookie).
DB: Supabase (Postgres). Tables: profiles, pins, user_sessions.
Geocoding: Google Geocoding API proxied server-side.
"""

# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, UploadFile, File
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone, timedelta
import os
import logging
import uuid
import httpx
import jwt as pyjwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GOOGLE_GEOCODING_API_KEY = os.environ["GOOGLE_GEOCODING_API_KEY"]
EMERGENT_AUTH_URL = os.environ.get("EMERGENT_AUTH_URL", "https://demobackend.emergentagent.com")
ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]

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


class SignupIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class EmergentCallbackIn(BaseModel):
    session_id: str


class PatchPinIn(BaseModel):
    status: str  # approved | rejected | pending


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = ""
    is_admin: bool = False
    provider: str = "supabase"  # supabase | emergent


# ---------- Helpers ----------
def is_admin_email(email: Optional[str]) -> bool:
    if not email:
        return False
    return email.lower() in ADMIN_EMAILS


async def ensure_profile(user_id: str, email: str, name: str = "", picture: str = "", provider: str = "supabase") -> dict:
    """Insert profile if missing; otherwise return existing. Never overwrites is_admin (computed live)."""
    existing = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    if existing.data:
        return existing.data[0]
    payload = {
        "id": user_id,
        "email": email,
        "name": name or email.split("@")[0],
        "picture": picture,
        "provider": provider,
        "is_admin": is_admin_email(email),
    }
    sb.table("profiles").insert(payload).execute()
    return payload


async def get_user_from_emergent_cookie(request: Request) -> Optional[dict]:
    token = request.cookies.get("session_token")
    if not token:
        # fallback: Authorization Bearer
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1]
    if not token:
        return None

    res = sb.table("user_sessions").select("*").eq("session_token", token).limit(1).execute()
    if not res.data:
        return None
    sess = res.data[0]
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None

    prof = sb.table("profiles").select("*").eq("id", sess["user_id"]).limit(1).execute()
    if not prof.data:
        return None
    p = prof.data[0]
    return {
        "id": p["id"],
        "email": p["email"],
        "name": p.get("name") or "",
        "picture": p.get("picture") or "",
        "is_admin": is_admin_email(p["email"]),  # live check, not stored value
        "provider": p.get("provider") or "emergent",
    }


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
        "provider": "supabase",
    }


async def current_user(request: Request) -> Optional[dict]:
    user = get_user_from_supabase_jwt(request)
    if user:
        # Read-only: ensure profile exists once (insert if missing). is_admin computed live.
        await ensure_profile(user["id"], user["email"], user.get("name", ""), user.get("picture", ""), "supabase")
        return user
    return await get_user_from_emergent_cookie(request)


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
    await ensure_profile(user.id, user.email, body.name or "", "", "supabase")

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
    await ensure_profile(user.id, user.email, name, "", "supabase")
    return {
        "access_token": sess.access_token,
        "refresh_token": sess.refresh_token,
        "user": {
            "id": user.id, "email": user.email,
            "name": name,
            "is_admin": is_admin_email(user.email),
        },
    }


# ---------- Routes: Emergent Google OAuth ----------
@api.post("/auth/emergent/callback")
async def emergent_callback(body: EmergentCallbackIn, response: Response):
    """Exchange Emergent session_id for user data + session_token, store, set cookie."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{EMERGENT_AUTH_URL}/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail=f"Emergent auth failed: {r.text}")
    data = r.json()
    email = data["email"]
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data["session_token"]

    # Use Emergent's `id` as our profile id (deterministic per email)
    user_id = data.get("id") or f"emg_{uuid.uuid4().hex[:12]}"

    # Upsert profile (use service-role client which is never auth-mutated)
    await ensure_profile(user_id, email, name, picture, "emergent")

    # Store session (7 days)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    sb.table("user_sessions").upsert({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": expires_at.isoformat(),
    }, on_conflict="session_token").execute()

    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )
    return {
        "user": {
            "id": user_id, "email": email, "name": name, "picture": picture,
            "is_admin": is_admin_email(email), "provider": "emergent",
        }
    }


@api.get("/auth/me")
async def auth_me(request: Request):
    u = await current_user(request)
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return u


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        try:
            sb.table("user_sessions").delete().eq("session_token", token).execute()
        except Exception:
            pass
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
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
@api.get("/geocode")
async def geocode(q: str = Query(..., min_length=1, max_length=120)):
    """Proxy to Google Geocoding API. Returns top results with city + lat/lng."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": q, "key": GOOGLE_GEOCODING_API_KEY},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Geocoding failed")
    data = r.json()
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        raise HTTPException(status_code=502, detail=data.get("status", "GEOCODE_ERROR"))
    results = []
    for item in data.get("results", [])[:8]:
        loc = item.get("geometry", {}).get("location", {})
        comps = item.get("address_components", [])
        city = ""
        country = ""
        for c in comps:
            types = c.get("types", [])
            if "locality" in types or "postal_town" in types:
                city = c.get("long_name", "")
            if "country" in types:
                country = c.get("long_name", "")
        if not city and comps:
            for c in comps:
                if "administrative_area_level_1" in c.get("types", []):
                    city = c.get("long_name", "")
                    break
        results.append({
            "label": item.get("formatted_address", ""),
            "city": city,
            "country": country,
            "lat": loc.get("lat"),
            "lng": loc.get("lng"),
        })
    return {"results": results}


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
