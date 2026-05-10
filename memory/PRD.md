# CorteQS Diaspora Globe — Product Requirements

## Original Problem Statement
> CorteQS Diaspora Globe — full-stack uygulama kur.
> Stack: React + Three.js + FastAPI + Supabase
> Tasarım: NASA Blue Marble texture + dark space tema
> Auth: Supabase Email+Password + Supabase Google OAuth
> Özellikler: v1.0 (pin görüntüleme, hover, arama, fly-to, otomatik döndürme) + v1.1 (Google Geocoding ile şehir arama, haritada tıkla pin ekleme, pinch-to-zoom)
> Sample veri: ~25 pin (Avrupa diasporası ağırlıklı + global karışım)

User-supplied keys: SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, GOOGLE_GEOCODING_API_KEY.
Reference doc: `CorteQS Diaspora Globe.md` (uploaded by user).

## Architecture
- **Frontend**: React 19 + react-router-dom 7 + Three.js 0.184 + @supabase/supabase-js + shadcn/ui + Sora font
- **Backend**: FastAPI on :8001 (k8s ingress `/api/*`), supabase-py admin client, httpx for geocoding
- **DB / Auth**: Supabase Postgres (tables: `profiles`, `pins`)
- **Auth**: Supabase JWT (Bearer) for both email/password and Google OAuth flows

## User Personas
1. **Anonymous visitor** — explores globe, searches cities, hovers pins, sees approved pins only
2. **Authenticated diaspora member** — adds pins (pending moderation), can view own submissions
3. **Admin / moderator** — approves/rejects/deletes pins via `/admin` panel

## Implemented (Feb 2026)
- ✅ Three.js globe (NASA Blue Marble, atmosphere + glow + 3500 stars, 0.0018 rad/frame auto-rotate, 3.5s idle delay)
- ✅ DOM-overlay emoji pins (5 types: person ❤️ / business 🏪 / ngo 🤝 / creator 🎥 / event ⚡)
- ✅ Event pin double-pulse-ring + blink animation
- ✅ Raycasting hover with state-update only on change → tooltip with name/hood/city
- ✅ Mouse drag rotation (clamped X), scroll zoom (1.25–5.5), touch drag, **pinch-to-zoom (v1.1)**
- ✅ Cubic ease-out fly-to with shortest-path Y wrap-around
- ✅ Search with local CITIES dictionary + live **Google Geocoding** suggestions (v1.1)
- ✅ Filter rail (5 types + counts)
- ✅ **Click-on-globe to add pin (v1.1)** — converts world→lat/lng, opens modal
- ✅ Auth modal with tabs: Email/Pass (Supabase admin API) + Google OAuth (Supabase signInWithOAuth)
- ✅ Pin moderation flow (status pending|approved|rejected) + admin panel `/admin`
- ✅ Geocoding proxy with API key kept server-side
- ✅ Sample seed of 25 pins (Berlin/Istanbul/Paris/London/Amsterdam/...)
- ✅ **Supabase Realtime**: live INSERT/UPDATE/DELETE broadcast → globe auto-updates in <1s
- ✅ **Wow arrival effect**: 3-stage expanding rings + bouncy scale-in emoji + glow + toast notification
- ✅ **Pin image upload** (Supabase Storage, public bucket `pin-images`, 4MB limit, jpg/png/webp/gif) — backend route `/api/upload/pin-image`
- ✅ **Pin description** (textarea, 500 char) stored in `pins.description`
- ✅ **PinDetailDrawer** — shadcn Sheet (right side), shows image header (or gradient+emoji fallback), name, type badge, hood/city, lat/lng, created date, status badge if pending, "Buraya yakınlaş" CTA
- ✅ **Cluster system** — adaptive lat/lng clustering with zoom-aware radius (poll camera.z @ 250ms, useMemo clusters). Single-pin clusters render as normal pin; multi-pin renders as cluster bubble (count + top-3 emoji mix + pulsing ring). Click cluster → fly-to + zoom in (~1.2 z reduction).
- ✅ **Personalized "Onaylandı 🎉" toast + auto-fly-to** when current user's own pending pin is approved (Realtime UPDATE event match `new.user_id === currentUser.id`)
- ✅ **Geo-IP initial fly-to** — `/api/geoip` (ip-api.com proxy) returns user's country/city + lat/lng → auto fly-to ~1.2s after page load with city toast

## Pending User Action
- 🟡 **Run `/app/backend/supabase_setup.sql` in Supabase SQL Editor** (one-time DDL — no other path possible without DB password)
- 🟡 Add admin email to `ADMIN_EMAILS` in `/app/backend/.env`

## Backlog / P1
- Realtime pin updates via Supabase Realtime
- Image upload for pins (avatar/logo) via Supabase Storage
- Pin detail drawer with gallery + comments
- Cluster system for dense regions
- Email verification + password reset flow
- Geo-IP for initial fly-to to user country
- v1.2 features (cluster, day/night texture, heat map)

## Backlog / P2
- WebSocket realtime pin animation (parlasın)
- AR mode (experimental)
- Multi-language (EN/TR/DE/...)
EOF