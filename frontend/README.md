# Frontend

React client for CorteQS Globe.

## Required env

Local development:

```env
REACT_APP_BACKEND_URL=http://localhost:8001
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key
ENABLE_HEALTH_CHECK=true
```

Production build:

```env
REACT_APP_BACKEND_URL=https://globe.corteqs.net
REACT_APP_SUPABASE_URL=https://hvzkpkhptgdbowucvypt.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key
ENABLE_HEALTH_CHECK=false
```

## Commands

```bash
npm install
npm start
npm run build
```

The frontend never falls back to Emergent preview domains. If `REACT_APP_BACKEND_URL` is missing or invalid, runtime falls back to the current browser origin and uses `/api`.
