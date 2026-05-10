# CorteQS Diaspora Globe Coolify Deployment Guide

Bu rehber, projeyi Coolify üzerinde tek domain mimarisiyle deploy etmek için hazırlanmıştır. Hedef yapı şudur:

- Kullanıcılar yalnızca frontend domainine gider.
- Frontend, `nginx` ile statik React build'ini sunar.
- `nginx`, `/api` isteklerini Coolify iç ağındaki `backend:8001` servisine proxy eder.
- Veritabanı olarak harici Supabase kullanılır; bu repoda yerel veritabanı servisi yoktur.

## 1. Ön Koşullar

Deploy öncesinde şunların hazır olduğundan emin olun:

- Çalışan bir Coolify sunucusu
- Repo erişimi
- Bir domain veya subdomain
- Hazır bir Supabase projesi
- Supabase SQL Editor erişimi
- Gerekliyse Google Geocoding API key

Bu projede backend FastAPI, frontend ise React + CRACO tabanlıdır. Backend `8001`, frontend container içinde `80` portunda çalışır.

## 2. Repodaki Deployment Dosyaları

Bu deployment için aşağıdaki dosyalar kullanılır:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `docker-compose.yml`
- `.env.production`

Coolify tarafında ana giriş dosyası `docker-compose.yml` olacaktır.

## 3. Supabase SQL Kurulumu

Eğer Supabase tabloları ve politikaları henüz kurulmadıysa, şu SQL dosyalarını sırayla çalıştırın:

1. `corteqs-env/supabase_setup.sql`
2. `corteqs-env/realtime_enable.sql`
3. `corteqs-env/p1_setup.sql`

Bu adım yapılmadan auth, pin listesi, realtime veya image upload akışları eksik çalışabilir.

## 4. Coolify'da Proje Oluşturma

1. Coolify panelinde yeni bir proje oluşturun.
2. Repo kaynağını bağlayın.
3. Deployment tipi olarak `Docker Compose` seçin.
4. Compose dosyası olarak repo kökündeki `docker-compose.yml` dosyasını kullanın.

Bu kurulumda iki servis oluşur:

- `backend`
- `frontend`

Public trafik `frontend` servisine gidecektir. `backend` ayrı public servis olarak publish edilmemelidir.

## 5. Environment Variables Konfigürasyonu

Coolify'de environment değerlerini UI üzerinden girmeniz önerilir. Repodaki `.env.production` dosyası bir şablondur; gerçek secret'ları repoya yazmayın.

### Backend için gerekli değişkenler

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_GEOCODING_API_KEY`
- `EMERGENT_AUTH_URL`
- `ADMIN_EMAILS`
- `CORS_ORIGINS`

### Frontend build için gerekli değişkenler

- `REACT_APP_BACKEND_URL`
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `ENABLE_HEALTH_CHECK=false`

### Önemli değer açıklamaları

- `SUPABASE_SERVICE_ROLE_KEY` yalnızca backend içindir. Frontend'e asla expose edilmemelidir.
- `REACT_APP_SUPABASE_ANON_KEY` frontend bundle içine girer; bu normaldir.
- `REACT_APP_BACKEND_URL` tek domain yapısında frontend'in public origin'i olmalıdır.

Örnek:

```env
REACT_APP_BACKEND_URL=https://globe.example.com
```

Böylece frontend istekleri şu biçimde gider:

```text
https://globe.example.com/api/health
https://globe.example.com/api/pins
```

## 6. Tek Domain Yayın Modeli

Önerilen yapı:

- Frontend public domain: `https://globe.example.com`
- Backend public edilmez
- `frontend/nginx.conf`, `/api` isteklerini `http://backend:8001` adresine yönlendirir

Bu model şu avantajları sağlar:

- Tarayıcı tarafında tek origin kullanılır
- CORS karmaşıklığı azalır
- Coolify ağ topolojisi daha sade olur

Not: Backend kodu şu anda `CORS_ORIGINS` değişkenini aktif olarak okumuyor; `server.py` içinde CORS geniş açık. Bu deployment dosyaları backend davranışını değiştirmez, yalnızca mevcut durumu dokümante eder.

## 7. Domain ve SSL Ayarları

1. Coolify içinde public domain'i `frontend` servisine bağlayın.
2. SSL/Let's Encrypt ayarını etkinleştirin.
3. Ayrı backend domain tanımlamayın.

Uygulama dış dünyaya yalnızca frontend domaini üzerinden açılmalıdır.

## 8. Deploy Adımları

1. Environment variables değerlerini Coolify UI'da girin.
2. `frontend` build arg değerlerinin boş olmadığını doğrulayın.
3. Deploy işlemini başlatın.
4. Build loglarında şu adımları kontrol edin:
   - backend için `pip install -r requirements.txt`
   - frontend için `npm install`
   - frontend için `npm run build`
   - nginx container ayağa kalkışı

Deploy sonrası `frontend` servisinin healthy ve erişilebilir olduğunu doğrulayın.

## 9. Post-Deploy Doğrulama

Aşağıdaki kontrolleri yapın:

### Frontend ana sayfa

Tarayıcıda açın:

```text
https://your-domain.example/
```

Uygulama yüklenmeli ve istemci tarafı route'lar çalışmalıdır.

### Backend health endpoint

```bash
curl https://your-domain.example/api/health
```

Beklenen çıktı:

```json
{"ok":true}
```

### Pin listesi

```bash
curl https://your-domain.example/api/pins
```

200 yanıtı ve pin listesi dönmelidir.

### Auth akışı

- Email/password signup-login akışı çalışmalı
- Supabase oturumu frontend'de oluşmalı
- Eğer kullanılıyorsa Emergent Google OAuth callback akışı sorunsuz dönmeli

## 10. Sorun Giderme

### Frontend build sırasında env değerleri gelmiyor

Belirti:

- Uygulama açılıyor ama API çağrıları `undefined/api/...` oluyor

Kontrol:

- `REACT_APP_BACKEND_URL`
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

Bu değişkenler build anında gereklidir. Sonradan yalnızca container restart etmek yetmez; frontend image yeniden build edilmelidir.

### `/api` istekleri 502/504 dönüyor

Kontrol:

- `backend` servisi gerçekten ayakta mı
- `backend` health check geçiyor mu
- `frontend/nginx.conf` içinde upstream adı `backend` ile compose servis adı aynı mı

### Supabase auth çalışmıyor

Kontrol:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- frontend ve backend'deki Supabase URL değerleri aynı mı

### `SUPABASE_SERVICE_ROLE_KEY` sızıntı riski

- Bu anahtarı `REACT_APP_*` değişkenlerine koymayın
- Frontend Docker build arg olarak yalnızca public `REACT_APP_*` değişkenleri verin
- Secret'ı yalnızca backend runtime env olarak tutun

### Production'da dev health veya websocket ayarları karışıyor

- `ENABLE_HEALTH_CHECK=false` bırakın
- `WDS_SOCKET_PORT` gibi geliştirme odaklı değerleri production'a taşımayın

## 11. Kullanılmayan Legacy Değişkenler

Eski bundle içinde görülen aşağıdaki değişkenler bu deployment'ta kullanılmaz:

- `MONGO_URL`
- `DB_NAME`

Çünkü bu proje production'da Supabase kullanır; yerel MongoDB servisi yoktur.

## 12. Yerel Doğrulama Notu

Coolify dışında yerelde compose denemesi yapacaksanız, build arg interpolation için şu iki yöntemden birini kullanın:

1. `.env.production` dosyasını geçici olarak `.env` adına kopyalamak
2. `docker compose --env-file .env.production config` veya benzeri komutlar kullanmak

Sebep: `docker-compose.yml` içindeki `${...}` ifadeleri compose interpolation aşamasında çözülür.
