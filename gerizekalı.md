# CorteQS Globe Production Kurulum Notu

Bu dosya, production'a gecis sirasinda hata yapmamak icin hazirlandi. Amac su:

- uygulama sadece `https://globe.corteqs.net` origin'inde calissin
- frontend API cagrilarini ayni origin altinda `/api` uzerinden yapsin
- Supabase Google login dogru donsun
- eski preview veya farkli backend alan adlari devrede kalmasin

## 1. Ne yukleyeceksin

Coolify tarafina yukleyecegin env referansi: `.env.ubt`

Bu dosya iki tip degisken iceriyor:

- backend runtime degiskenleri
- frontend build-time degiskenleri

En kritik nokta:

- `REACT_APP_*` ile baslayan degiskenler frontend build sirasinda bundle'a gomulur
- yani bunlari degistirdikten sonra sadece restart yetmez
- frontend icin yeniden build almak zorundasin

## 2. `.env.ubt` icinde hangi alanlari dolduracaksin

Asagidaki alanlari gercek degerlerinle doldur:

- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_GEOCODING_API_KEY`
- `ADMIN_EMAILS`
- `REACT_APP_SUPABASE_ANON_KEY`

Bu alanlar sabit kalacak:

- `SUPABASE_URL=https://hvzkpkhptgdbowucvypt.supabase.co`
- `REACT_APP_SUPABASE_URL=https://hvzkpkhptgdbowucvypt.supabase.co`
- `REACT_APP_BACKEND_URL=https://globe.corteqs.net`
- `CORS_ORIGINS=https://globe.corteqs.net`
- `ENABLE_HEALTH_CHECK=false`

Not:

- `SUPABASE_ANON_KEY` ve `REACT_APP_SUPABASE_ANON_KEY` ayni deger olmali
- `SUPABASE_SERVICE_ROLE_KEY` sadece backend icin kullanilir

## 3. Coolify'de tam olarak ne yapacaksin

1. Coolify'de projeyi ac.
2. Repo olarak bu projeyi kullanan resource'u bul.
3. Compose dosyasinin `docker-compose.yaml` oldugunu kontrol et.
4. Environment Variables ekranina gir.
5. Oradaki eski degiskenleri gozden gecir.
6. Eski kalan su alanlar varsa sil:
   - `MONGO_URL`
   - `DB_NAME`
   - `WDS_SOCKET_PORT`
   - eski preview backend URL'leri
7. `.env.ubt` icindeki degerleri Coolify env alanina gir ya da dosya yukleme destekleniyorsa bu dosyayi referans al.
8. Frontend build arg olarak sunlarin geldigini kontrol et:
   - `REACT_APP_BACKEND_URL`
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
   - `ENABLE_HEALTH_CHECK`
9. Backend runtime icin sunlarin geldigini kontrol et:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_GEOCODING_API_KEY`
   - `ADMIN_EMAILS`
   - `CORS_ORIGINS`

## 4. En kritik kisim: rebuild

Burada en cok hata cikan yer burasi.

Sunu unutma:

- frontend env degiskenleri image build sirasinda bundle'a girer
- bu yuzden sadece restart yaparsan eski URL bundle icinde kalabilir

Yapman gereken:

1. Frontend icin rebuild tetikle
2. Ardindan redeploy et
3. Sadece restart yapip cikma

Guvenli kural:

- env degisti mi -> rebuild + redeploy

## 5. Supabase tarafinda ne kontrol edeceksin

Supabase Dashboard icinde:

1. `Authentication -> URL Configuration` kismina gir
2. `Site URL` degeri su olmali:
   - `https://globe.corteqs.net`
3. Redirect URL listesinde en az su olmali:
   - `https://globe.corteqs.net/`
4. Local development gerekiyorsa ayrica localhost redirect kalabilir
5. Google provider aktif olmali

## 6. Google Cloud OAuth tarafinda ne kontrol edeceksin

Google Cloud Console icinde OAuth client ayarina git.

Sunlari kontrol et:

- Authorized JavaScript origins:
  - `https://globe.corteqs.net`
- Authorized redirect URIs:
  - `https://hvzkpkhptgdbowucvypt.supabase.co/auth/v1/callback`

Burada `globe.corteqs.net/auth/callback` yazmiyorsun.
Google redirect'i Supabase callback'ine donecek.
Frontend tarafindaki `/auth/callback` route'u tarayici icindeki session tamamlama akisinda kullaniliyor; bu normal.

## 7. Deploy sonrasi nasil test edeceksin

### A. Hemen ilk kontrol

Tarayicida ac:

- `https://globe.corteqs.net`

Beklenen:

- uygulama acilir
- console'da bariz config hatasi olmaz

### B. API kontrolu

Network tab ac ve sunlari izle:

- `/api/pins`
- `/api/geoip`
- `/api/geocode`
- `/api/auth/me`

Beklenen:

- hepsi `https://globe.corteqs.net/api/...` olarak gitsin
- baska bir domaine gitmesin
- CORS hatasi cikmasin

### C. Auth kontrolu

1. Email signup dene
2. Email login dene
3. Google login dene

Beklenen:

- Google popup/acilis Supabase uzerinden olsun
- login tamamlaninca kullanici `https://globe.corteqs.net/` adresine donsun
- login sonrasi `/api/auth/me` basarili donsun

## 8. Bir sey ters giderse en olasi sebepler

### Sorun: uygulama hala eski backend'e gidiyor

En olasi neden:

- frontend rebuild yapilmadi

Cozum:

1. Coolify env degerlerini tekrar kontrol et
2. `REACT_APP_BACKEND_URL=https://globe.corteqs.net` oldugunu dogrula
3. frontend rebuild + redeploy yap

### Sorun: Google login donmuyor

En olasi neden:

- Supabase Site URL yanlis
- Google OAuth redirect URI eksik

Cozum:

1. Supabase URL Configuration'i tekrar kontrol et
2. Google Cloud OAuth client ayarini tekrar kontrol et

### Sorun: `/api/*` 502 donuyor

En olasi neden:

- backend container ayakta degil
- `frontend/nginx.conf` proxy backend'e ulasamiyor

Cozum:

1. backend health'i kontrol et
2. compose servis adinin `backend` oldugunu kontrol et

## 9. Kisa checklist

Deploy oncesi:

- `.env.ubt` icindeki placeholder alanlari doldurdum
- Coolify'de eski env kalintilarini sildim
- Supabase Site URL'i `https://globe.corteqs.net` yaptim
- Google OAuth origin ve redirect ayarlarini dogruladim

Deploy sirasinda:

- frontend rebuild yaptim
- redeploy yaptim

Deploy sonrasi:

- `/api` istekleri ayni origin'e gidiyor
- Google login dogru geri donuyor
- CORS hatasi yok

## 10. Sana tek cumlede ozet

Bu iste en onemli nokta su: Coolify'de dogru env'leri gir, eski env'leri sil, sonra mutlaka frontend rebuild + redeploy yap; yoksa eski bundle yuzunden uygulama yanlis backend'e gitmeye devam eder.
