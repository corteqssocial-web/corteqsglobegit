CorteQS Diaspora Globe — Environment Variables Bundle
======================================================

Bu paketteki dosyalar:
  - backend.env       → /app/backend/.env  olarak yerleştir
  - frontend.env      → /app/frontend/.env olarak yerleştir
  - supabase_setup.sql + realtime_enable.sql + p1_setup.sql → Supabase SQL Editor'a yapıştır

------------------------------------------------------
KURULUM ADIMLARI
------------------------------------------------------

1. Backend .env yerleştir:
   cp backend.env /app/backend/.env

2. Frontend .env yerleştir:
   cp frontend.env /app/frontend/.env

3. Supabase tablolarını oluştur (eğer henüz yapılmadıysa):
   https://supabase.com/dashboard/project/hvzkpkhptgdbowucvypt/sql/new
   adresine git, SQL dosyalarındaki içerikleri sırayla paste et:
     a) supabase_setup.sql       (ilk kurulum — tablolar)
     b) realtime_enable.sql      (canlı güncellemeler)
     c) p1_setup.sql             (resim yükleme + açıklama)

4. Servisleri yeniden başlat:
   sudo supervisorctl restart backend frontend

5. Admin yetkisi vermek istersen:
   /app/backend/.env dosyasında ADMIN_EMAILS satırını düzenle:
     ADMIN_EMAILS="senin@email.com,arkadasin@email.com"
   Sonra: sudo supervisorctl restart backend

------------------------------------------------------
GÜVENLİK NOTLARI
------------------------------------------------------

- SUPABASE_SERVICE_ROLE_KEY çok güçlü bir anahtar (RLS'i bypass eder).
  ASLA frontend'e veya public bir repoya commit etme.

- GOOGLE_GEOCODING_API_KEY backend'de proxy ediliyor.
  Frontend'e doğrudan koymadığımız için herkes kullanamaz.
  Google Cloud Console'dan IP/HTTP referrer kısıtlaması ekle (önerilir):
    https://console.cloud.google.com/google/maps-apis/credentials

- SUPABASE_ANON_KEY ve REACT_APP_SUPABASE_ANON_KEY public OK.
  Bunlar zaten frontend bundle'ına giriyor (Supabase tasarımı böyle).
  Güvenlik RLS politikalarıyla sağlanıyor.

- .env dosyalarını ASLA git'e commit etme.
  Repo'ya .env.example commit et, .env'i .gitignore'a koy.

------------------------------------------------------
YENİ ORTAMA TAŞIRSAN DEĞİŞTİRİLMESİ GEREKEN ALANLAR
------------------------------------------------------

frontend.env:
  REACT_APP_BACKEND_URL  → production public origin (örn. https://globe.corteqs.net)

backend.env:
  CORS_ORIGINS           → production public origin
  ADMIN_EMAILS           → yeni kişiler

Diğer her şey aynı kalabilir (Supabase ve Google anahtarları).

------------------------------------------------------
HIZLI DOĞRULAMA
------------------------------------------------------

# Frontend origin üstünden backend canlı mı?
curl https://globe.corteqs.net/api/health
# → {"ok":true} dönmeli

# Pinler geliyor mu?
curl https://globe.corteqs.net/api/pins
# → {"pins":[...],"setup_required":false}

# Geo-IP çalışıyor mu?
curl https://globe.corteqs.net/api/geoip
# → {"country_code":"...","lat":...,"lng":...}

------------------------------------------------------
SORUN GİDERME
------------------------------------------------------

Supabase auth çalışmıyor:
  - SUPABASE_URL ve SUPABASE_ANON_KEY iki dosyada da eşleşiyor mu?
  - Supabase dashboard'da Auth → Email enabled mı?

Pin görünmüyor:
  - SQL setup yapıldı mı? (supabase_setup.sql)
  - Pin status 'approved' mi?
  - RLS policy çalışıyor mu? (anyone reads approved pins)

Realtime çalışmıyor:
  - realtime_enable.sql çalıştırıldı mı?
  - Tarayıcı console'unda WebSocket hatası var mı?

Image upload başarısız:
  - p1_setup.sql çalıştırıldı mı? (pin-images bucket + policy)
  - Dosya 4MB'tan büyük mü?
