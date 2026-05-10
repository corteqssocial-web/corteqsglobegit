# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CorteQS Globe is a full-stack diaspora globe application with a **React frontend** (Three.js-based 3D globe visualization) and a **FastAPI backend** (Supabase + Google Geocoding integration).

### Key Technology Stack

**Frontend:**
- React 19 with React Router for navigation
- CRACO for webpack customization
- Three.js for 3D globe rendering
- Radix UI + Tailwind CSS for components & styling
- Supabase JS client for authentication & realtime subscriptions
- react-hook-form + Zod for form validation
- axios for API calls

**Backend:**
- FastAPI with uvicorn
- Supabase (PostgreSQL) for database
- Google Geocoding API for location services
- Emergent-managed Google OAuth integration
- Pydantic for request/response models
- JWT for session verification

## Development Commands

### Frontend Setup

```bash
cd frontend

# Install dependencies (uses Yarn per package.json)
npm install  # or yarn install

# Development server (runs on port 3000)
npm start

# Production build
npm build

# Run tests
npm test
```

**Environment Setup:**
1. Copy `frontend/.env.example` to `frontend/.env.local`
2. Configure Supabase credentials (REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY)
3. Set REACT_APP_BACKEND_URL (defaults to preview backend in .env.example)
4. Optional: Set ENABLE_HEALTH_CHECK=true for dev health endpoints

### Backend Setup

```bash
cd backend

# Install dependencies (requires Python 3.8+)
python -m pip install -r requirements.txt

# Run development server (port 8001)
uvicorn server:app --reload --port 8001

# Run tests
pytest

# Format code
black . && isort .

# Type checking
mypy .

# Linting
flake8 .
```

**Environment Setup:**
1. Copy `backend/.env.example` to `backend/.env`
2. Configure required variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_GEOCODING_API_KEY, EMERGENT_AUTH_URL, ADMIN_EMAILS

### Docker Deployment

```bash
# Build and run both services
docker-compose up --build

# Backend health check: GET http://localhost:8001/api/health
# Frontend: http://localhost:80
```

## Architecture & Key Patterns

### Frontend Architecture

**Component Structure:**
- `components/` — UI components (DiasporaGlobe, AuthModal, AddPinModal, AdminPanel, etc.)
- `contexts/AuthContext.jsx` — Global auth state (user, loading, logout)
- `lib/` — Shared utilities:
  - `api.js` — axios-based API client for backend communication
  - `supabase.js` — Supabase client initialization
  - `pinTypes.js` — Pin type definitions (person, business, ngo, creator, event)
  - `utils.js` — Helper functions
- `hooks/use-toast.js` — Custom hook for toast notifications (from Sonner)

**Key Patterns:**
- **Auth Flow:** Supabase Email/Password (JWT) + Emergent Google OAuth (session_id → httpOnly cookie)
- **Realtime Updates:** Supabase Realtime subscriptions for live pin updates
- **Routing:** React Router with AuthCallback component for OAuth redirect handling
- **State Management:** React Context (AuthContext) for auth; local component state for UI (pins, filters, search)
- **3D Rendering:** Three.js in DiasporaGlobe component with React integration

### Backend Architecture

**Key Components in `server.py`:**
- **Models:** Pydantic data classes (PinIn, PinOut, UserSession, etc.) for validation
- **Clients:** Two Supabase clients:
  - `sb` — Service role client (admin privileges, bypasses RLS)
  - `sb_auth` — Anon key client (for auth operations)
- **Routers:** APIRouter with `/api` prefix for RESTful endpoints
- **Auth:** JWT verification from Supabase, admin check via ADMIN_EMAILS list
- **Geocoding:** Google Geocoding API proxy for address-to-coords conversion

**Database Schema:**
- `profiles` — User profiles
- `pins` — Diaspora data (type, location, creator)
- `user_sessions` — OAuth session tracking

**Auth Flow:**
1. Frontend: Email/Password → Supabase JWT
2. Frontend: Google OAuth → Emergent → session_id → backend httpOnly cookie
3. Backend: Verify JWT from Authorization header or session cookie

### Environment & Deployment

**Configuration:**
- Environment variables control all credentials (no hardcoded secrets)
- Frontend: React env vars prefixed with `REACT_APP_`
- Backend: Python dotenv loads `.env`
- Docker Compose: Passes env via `.env.production`

**Health Checks:**
- Frontend: Optional health endpoints if `ENABLE_HEALTH_CHECK=true` (for deployment verification)
- Backend: `GET /api/health` — returns 200 if Supabase/Google APIs reachable

## Code Style & Standards

### TypeScript/JavaScript

- Use `.jsx`/`.js` for React components (current codebase uses JavaScript, not TypeScript)
- Functional components with React Hooks
- Named exports for utilities; default export for components
- Use Radix UI primitives for accessible components
- Validate user input with Zod schemas before API calls

### Python

- Follow PEP 8
- Use type annotations (Pydantic models for validation)
- Async/await with FastAPI for I/O operations
- Logging via standard `logging` module (not `print`)
- Format with `black`, sort imports with `isort`

## Testing

**Frontend:**
- `npm test` — runs Jest tests (if configured in craco)
- Place tests in same directory as components or dedicated `__tests__` folder

**Backend:**
- `pytest` for unit/integration tests
- `backend_test.py` is the main test file
- Mark tests: `@pytest.mark.unit`, `@pytest.mark.integration`
- Run with coverage: `pytest --cov=backend --cov-report=term-missing`

## Common Workflows

### Adding a New Pin Type

1. Update `frontend/src/lib/pinTypes.js` with new type definition
2. Update `backend/server.py` — PinIn model and pin creation logic
3. Update `frontend/src/components/AddPinModal.jsx` — form fields for new type
4. Database: No schema change needed (type is a string enum)

### Modifying Authentication

**Frontend Changes:**
- Edit `frontend/src/contexts/AuthContext.jsx` for auth state
- Edit `frontend/src/components/AuthModal.jsx` for login UI
- Update `frontend/src/components/AuthCallback.jsx` if OAuth redirect logic changes

**Backend Changes:**
- Edit `backend/server.py` auth endpoints
- Update JWT verification logic if needed
- Check Emergent OAuth session handling

### Adding a New API Endpoint

**Backend:**
1. Define Pydantic model in `server.py` (request/response)
2. Add route to APIRouter with proper decorators (`@api.get()`, `@api.post()`, etc.)
3. Include JWT verification via `Depends(verify_jwt_token)` or similar
4. Add to tests in `backend_test.py`

**Frontend:**
1. Add method to `frontend/src/lib/api.js`
2. Import and use in component
3. Handle loading/error states with toast notifications

### Deploying to Production

1. Build frontend: `npm run build` → outputs to `frontend/build`
2. Ensure backend `.env` has production secrets
3. Run `docker-compose -f docker-compose.yaml up --build`
4. Verify health checks pass
5. Backend health: `curl http://localhost:8001/api/health`

## Important Notes

### Critical Auth Behavior

- **Frontend JWT:** Supabase session stored in localStorage; sent as Bearer token
- **Backend JWT Verification:** Uses SUPABASE_ANON_KEY public key (not service role)
- **Session Cookies:** Emergent Google OAuth uses httpOnly cookies; never expose in JavaScript
- **EMERGENT_AUTH_URL:** Must not have fallbacks or redirect URLs (breaks auth)

### Supabase Clients

- **Service Role (`sb`):** Has admin privileges, bypasses Row Level Security (RLS) — use for admin operations only
- **Anon Key (`sb_auth`):** Limited privileges, respects RLS — use for user auth operations
- Never touch `.auth` namespace with service role client

### 3D Globe Performance

- DiasporaGlobe uses Three.js with WebGL rendering
- Pins may trigger "wow effect" animation on first arrival (arrivedIds tracking)
- Realtime subscriptions update globe without page refresh
- Consider performance when rendering many pins (use LOD or clustering if needed)

## Debugging Tips

- **Frontend:** Check browser console and Network tab
  - Verify REACT_APP_BACKEND_URL points to correct backend
  - Check CORS headers if API calls fail
  - Supabase session: `supabase.auth.getSession()`

- **Backend:** Check uvicorn logs
  - JWT decode errors → check Authorization header format
  - Supabase errors → verify credentials in `.env`
  - Google Geocoding errors → verify API key quota

- **Docker:** Check container logs
  - Frontend health: `curl http://localhost/health` (if enabled)
  - Backend health: `curl http://localhost:8001/api/health`
