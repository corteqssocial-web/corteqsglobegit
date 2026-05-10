# CorteQS Diaspora Globe — Technical Guide

## Project Overview
Full-stack diaspora map app. Users pin locations on a 3D globe. Moderated by admin.

- **Frontend**: React 19 + Three.js 0.184 + shadcn/ui + Tailwind, built with CRACO + yarn
- **Backend**: FastAPI on port 8001, supabase-py, httpx
- **DB/Auth**: Supabase Postgres (no self-hosted DB)
- **Deploy**: Docker Compose on Coolify (single public domain, nginx reverse proxy)

---

## Directory Structure

```
corteqs_globe/
├── backend/
│   ├── server.py          # ALL backend logic — single file FastAPI app
│   ├── requirements.txt   # Python deps
│   ├── Dockerfile
│   ├── supabase_setup.sql  # (also in corteqs-env/) — tables DDL
│   └── tests/backend_test.py
├── frontend/
│   ├── src/
│   │   ├── App.js                      # Root: MainScreen + routing (/ and /admin)
│   │   ├── components/
│   │   │   ├── DiasporaGlobe.jsx       # Three.js globe + DOM pin overlay + clustering
│   │   │   ├── AddPinModal.jsx         # Create pin form (with image upload)
│   │   │   ├── AdminPanel.jsx          # Approve/reject/delete pins (/admin route)
│   │   │   ├── AuthModal.jsx           # Email/pass + Google OAuth tabs
│   │   │   ├── AuthCallback.jsx        # OAuth callback handler
│   │   │   ├── PinDetailDrawer.jsx     # Right-side sheet: pin detail view
│   │   │   └── SearchBar.jsx           # City search with geocoding suggestions
│   │   ├── contexts/AuthContext.jsx    # Auth state: user, login/logout methods
│   │   ├── lib/
│   │   │   ├── api.js                  # axios client with Supabase JWT interceptor
│   │   │   ├── pinTypes.js             # PIN_TYPES dict + CITIES static dict
│   │   │   └── supabase.js             # Supabase browser client
│   │   └── App.css                     # Globe pin / cluster / arrival animations
│   ├── package.json        # yarn, React 19, Three.js, shadcn/ui (Radix), react-router-dom v7
│   ├── craco.config.js     # path aliases: @/ → src/
│   ├── Dockerfile
│   └── nginx.conf          # /api → backend:8001, SPA fallback
├── corteqs-env/            # SQL files for Supabase (canonical source for deploy docs)
│   ├── supabase_setup.sql  # Tables: profiles, pins, user_sessions + RLS
│   ├── realtime_enable.sql # Add pins to publication + approved-read policy
│   └── p1_setup.sql        # Add image_url/description cols + pin-images storage bucket
├── docker-compose.yaml     # backend (env_file: .env.production) + frontend (build args)
├── coolifydeploy.md        # Full Turkish-language Coolify deployment guide
└── memory/MEMORY.md        # ← this file
```

---

## Database Schema (Supabase)

### `public.profiles`
| col | type | notes |
|-----|------|-------|
| id | uuid PK | matches Supabase auth.users.id |
| email | text | |
| name | text | |
| picture | text | avatar URL |
| provider | text | `supabase` \| `emergent` |
| is_admin | bool | stored but always overridden live by ADMIN_EMAILS env |

### `public.pins`
| col | type | notes |
|-----|------|-------|
| id | uuid PK | |
| type | text | `person\|business\|ngo\|creator\|event` |
| name | text | |
| city | text | |
| hood | text | neighbourhood (optional) |
| lat | float | |
| lng | float | |
| status | text | `pending\|approved\|rejected` |
| user_id | uuid | FK to profiles (nullable for seeded pins) |
| created_at | timestamptz | |
| image_url | text | added by p1_setup.sql |
| description | text | added by p1_setup.sql, max 500 chars |

### `public.user_sessions`
Used for Emergent Google OAuth sessions (7-day httpOnly cookie flow).
| col | type |
|-----|------|
| session_token | text PK |
| user_id | uuid |
| expires_at | timestamptz |

### Supabase Storage
- Bucket: `pin-images` (public read, max 4MB, jpg/png/webp/gif)
- Path pattern: `{user_id}/{uuid}.{ext}`

---

## Backend API Routes (`/api/*`)

All routes are in `backend/server.py` under `api = APIRouter(prefix="/api")`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | none | health root |
| GET | `/health` | none | `{"ok":true}` |
| POST | `/auth/signup` | none | Create user via Supabase admin API, return JWT tokens |
| POST | `/auth/login` | none | Supabase sign_in_with_password, return JWT tokens |
| POST | `/auth/emergent/callback` | none | Exchange session_id for user, set httpOnly cookie |
| GET | `/auth/me` | any | Returns current user dict |
| POST | `/auth/logout` | any | Delete session cookie + DB row |
| GET | `/pins` | none/admin | Approved pins (all if admin) |
| GET | `/pins/mine` | user | Own pins |
| GET | `/pins/admin` | admin | All pins |
| POST | `/pins` | user | Create pin (status=pending) |
| PATCH | `/pins/{id}` | admin | Change status |
| DELETE | `/pins/{id}` | user/admin | Own or any (admin) |
| GET | `/geocode?q=` | none | Proxy Google Geocoding API |
| GET | `/geoip` | none | ip-api.com proxy for initial fly-to |
| POST | `/upload/pin-image` | user | Upload to Supabase Storage |
| POST | `/seed` | none | Insert 25 sample pins (idempotent) |

### Auth Architecture
- **Two Supabase clients**: `sb` (service role, for data ops) and `sb_auth` (anon key, for sign_in only). Never mix them — `sb` must not mutate session.
- **JWT decoding**: `pyjwt` without signature verification (trusts Supabase-issued token). Validates `iss` contains "supabase".
- **Admin check**: Live lookup of email in `ADMIN_EMAILS` env var — never trust stored `is_admin`.
- **Emergent OAuth**: httpOnly cookie `session_token`, verified against `user_sessions` table.

---

## Frontend Key Patterns

### Path Alias
`@/` resolves to `frontend/src/` (configured in `craco.config.js`).

### API Client (`src/lib/api.js`)
Axios with `withCredentials: true` (for Emergent cookie) + interceptor that attaches Supabase JWT Bearer token on every request.

### Auth Flow (`src/contexts/AuthContext.jsx`)
- On mount: calls `/api/auth/me` to restore session
- `signupEmail` / `loginEmail`: calls backend → receives tokens → calls `supabase.auth.setSession()` to sync Supabase client
- `loginGoogle`: calls `supabase.auth.signInWithOAuth({ provider: "google" })`
- `logout`: calls `/api/auth/logout` + `supabase.auth.signOut()`

### Globe (`src/components/DiasporaGlobe.jsx`)
- Three.js init runs once in `useEffect([], [])` — never re-run
- DOM pins overlaid via `position: absolute` using `toScreen()` world→screen projection
- **Clustering**: `clusterPins()` greedy pass, radius scales with `zoomZ` (camera.z polled every 250ms)
- **Fly-to**: cubic ease-out animation, shortest-path Y wrap-around, 6s delay then re-enables auto-rotate
- Auto-rotate: 0.0018 rad/frame, pauses on interaction, resumes after 3.5s idle

### Pin Types (`src/lib/pinTypes.js`)
```js
PIN_TYPES = { person, business, ngo, creator, event }  // emoji, label, color
CITIES = { "berlin": {lat, lng}, ... }  // 30 static cities, fallback to /api/geocode
```

### Realtime (`src/App.js`)
Supabase channel `pins-live` subscribes to INSERT/UPDATE/DELETE on `public.pins`.
- INSERT approved → add to state + arrival animation + toast
- UPDATE approved → add/update + personalized toast if own pin
- DELETE → remove from state

---

## Environment Variables

### Backend (runtime, `.env.production` → `docker-compose.yaml env_file`)
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # NEVER give to frontend
GOOGLE_GEOCODING_API_KEY
EMERGENT_AUTH_URL           # default: https://demobackend.emergentagent.com
ADMIN_EMAILS                # comma-separated
CORS_ORIGINS                # documented only; not actively enforced in code
```

### Frontend (build-time, passed as Docker build args)
```
REACT_APP_BACKEND_URL       # public origin e.g. https://globe.example.com
REACT_APP_SUPABASE_URL
REACT_APP_SUPABASE_ANON_KEY
ENABLE_HEALTH_CHECK         # false in production
```
**IMPORTANT**: `REACT_APP_*` vars are baked into the JS bundle at build time. Changing them requires a full frontend rebuild, not just a restart.

---

## Docker / Deployment

- Backend: `./backend/Dockerfile`, port 8001, env from `.env.production`
- Frontend: `./frontend/Dockerfile`, port 80, build args from compose
- nginx (`frontend/nginx.conf`): `/api/*` → `http://backend:8001/api/`, SPA fallback for React Router
- **Only `frontend` gets a public domain** — backend stays internal in Coolify network
- Service name in compose must remain `backend` — nginx upstream is hardcoded to `backend:8001`

### Supabase SQL Run Order
1. `corteqs-env/supabase_setup.sql` — tables + RLS
2. `corteqs-env/realtime_enable.sql` — publication + approved-read policy
3. `corteqs-env/p1_setup.sql` — image_url, description cols + storage bucket

---

## Critical Gotchas

1. **Two Supabase clients in backend**: `sb` (service role) for data, `sb_auth` (anon) for sign_in. Never use `sb` for auth operations.
2. **No hardcoded URLs in backend** (comment in server.py line 9): `DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH`
3. **JWT not signature-verified**: Backend decodes Supabase JWT without secret. Validates only `iss` field.
4. **Admin is live-computed**: `is_admin` = `email in ADMIN_EMAILS`. The stored DB value is ignored at runtime.
5. **Frontend env vars need rebuild**: Not runtime-injectable. Must rebuild the Docker image.
6. **CORS**: Currently `allow_origins=["*"]` — the `CORS_ORIGINS` env var is documented but not used in code.
7. **Cluster hitboxes**: Rebuilt every time `clusters` changes (useMemo on pins+filter+zoomZ). Each rebuild disposes old Three.js meshes.
8. **`arrivedIds` auto-clears**: 5-second timer removes pin from Set to stop arrival animation.

---

## Testing

- `backend/tests/backend_test.py` — pytest
- `test_reports/` — iteration JSON + pytest XML output
- Run: `cd backend && pytest tests/`

---

## Backlog (from PRD)

**P1 (not yet done per PRD — though some appear implemented):**
- Email verification + password reset flow

**P2:**
- Day/night texture, heat map
- WebSocket realtime pin animation
- AR mode (experimental)
- Multi-language (EN/TR/DE/...)
