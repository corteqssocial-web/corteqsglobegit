# CorteQS Globe

Supabase-first diaspora globe application with a React frontend and FastAPI backend.

## Structure

- `frontend/`: React + CRACO + Three.js client
- `backend/`: FastAPI API with Supabase auth, data, and storage integration
- `corteqs-env/`: deployment templates and Supabase SQL bootstrap files

## Local Development

### Frontend

1. Copy `frontend/.env.example` to `frontend/.env.local`.
2. Set:
   - `REACT_APP_BACKEND_URL=http://localhost:8001`
   - `REACT_APP_SUPABASE_URL=...`
   - `REACT_APP_SUPABASE_ANON_KEY=...`
3. Run:

```bash
cd frontend
npm install
npm start
```

### Backend

1. Copy `backend/.env.example` to `backend/.env` if you use a local backend env file.
2. Set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_GEOCODING_API_KEY`
   - `ADMIN_EMAILS`
3. Run:

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

## Production Model

Production is single-origin:

- Public app URL: `https://globe.corteqs.net`
- Frontend browser calls: `https://globe.corteqs.net/api/...`
- Nginx in `frontend/` proxies `/api` to the private `backend` service
- Supabase remains the system of record for auth, database, realtime, and storage

Set these frontend build variables in Coolify:

- `REACT_APP_BACKEND_URL=https://globe.corteqs.net`
- `REACT_APP_SUPABASE_URL=https://hvzkpkhptgdbowucvypt.supabase.co`
- `REACT_APP_SUPABASE_ANON_KEY=...`

Set these backend runtime variables in Coolify:

- `SUPABASE_URL=https://hvzkpkhptgdbowucvypt.supabase.co`
- `SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `GOOGLE_GEOCODING_API_KEY=...`
- `ADMIN_EMAILS=...`

Remove legacy env values from old deployments if present:

- `MONGO_URL`
- `DB_NAME`
- `WDS_SOCKET_PORT`

Changing `REACT_APP_*` values requires a fresh frontend rebuild. A container restart alone is not enough.
