# CorteQS Globe

Full-stack diaspora globe application with a React frontend and FastAPI backend.

## Structure

- `frontend/` React + CRACO + Three.js client
- `backend/` FastAPI API with Supabase integration

## Quick Start

### Frontend

1. Copy `frontend/.env.example` to `frontend/.env.local` if you want your own values.
2. Replace the Supabase values in `frontend/.env.local` with your real project keys for auth and realtime.
3. Run:

```bash
cd frontend
npm install
npm start
```

The checked-in local env points to the preview backend so the public globe can boot immediately.

### Backend

1. Copy `backend/.env.example` to `backend/.env`.
2. Fill in your Supabase and Google Geocoding credentials.
3. Run:

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

## Required Environment Variables

### Frontend

- `REACT_APP_BACKEND_URL`
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

### Backend

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_GEOCODING_API_KEY`
- `ADMIN_EMAILS`
