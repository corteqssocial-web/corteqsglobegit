# CorteQS Globe Coolify Deployment Rehberi

Bu dokuman, projeyi Coolify uzerinde sorunsuz sekilde yayina almak icin sifirdan yazildi. Amaç, onceki notlardaki belirsizlikleri kaldirmak ve kurulum sirasinda "hangi ekranda ne girecegim, hangi domain public olacak, hangi env backend'e gidecek, SQL ne zaman calisacak" gibi sorulari netlestirmektir.

Bu rehber tek domain mimarisini esas alir:

- Kullanicilar sadece frontend domainine gider.
- Frontend `nginx` uzerinden statik React build'ini sunar.
- Frontend container'i `/api` isteklerini Coolify ic agindaki `backend:8001` servisine proxy eder.
- Veritabani olarak Supabase kullanilir.
- Bu repoda production icin yerel Postgres veya Mongo servisi deploy edilmez.

## 1. Ozet Mimari

Production akisi su sekildedir:

1. Kullanici `https://globe.example.com` adresini acar.
2. Istek Coolify'da `frontend` servisine gelir.
3. `frontend/nginx.conf`, `/api/...` ile baslayan istekleri `http://backend:8001/api/...` adresine yonlendirir.
4. `backend` servisi FastAPI calistirir.
5. `backend`, Supabase ve Google Geocoding API ile konusur.

Bu projede public edilmesi gereken tek servis `frontend` servisidir. `backend` ayri bir public domain olarak acilmamalidir.

## 2. Bu Repoda Deploy'da Kullanilan Dosyalar

Coolify kurulumunda aktif rol oynayan dosyalar:

- `docker-compose.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `.env.production`
- `corteqs-env/supabase_setup.sql`
- `corteqs-env/realtime_enable.sql`
- `corteqs-env/p1_setup.sql`

Bu dosyalarin rolleri:

- `docker-compose.yml`: Coolify'nin okuyacagi ana tanim dosyasi.
- `backend/Dockerfile`: FastAPI image build'i.
- `frontend/Dockerfile`: React build alip bunu `nginx` ile servis eden image.
- `frontend/nginx.conf`: `/api` reverse proxy mantigi.
- `.env.production`: local referans / template. Secret'lari repoya commit etmek icin degil, hangi degiskenler gerektigini gostermek icin var.
- `corteqs-env/*.sql`: Supabase tarafinda tablo, policy, realtime ve storage kurulumu.

## 3. Deploy Oncesi Gerekenler

Kuruluma baslamadan once sunlar hazir olmali:

- Calisan bir Coolify instance
- Git repo erisimi
- Bir domain veya subdomain
- Hazir bir Supabase projesi
- Supabase SQL Editor erisimi
- Gecerli `SUPABASE_URL`
- Gecerli `SUPABASE_ANON_KEY`
- Gecerli `SUPABASE_SERVICE_ROLE_KEY`
- Gerekliyse `GOOGLE_GEOCODING_API_KEY`

Port bilgileri:

- Backend container ici port: `8001`
- Frontend container ici port: `80`

## 4. Once Supabase Hazirlanmali

Coolify deploy'undan once Supabase kurulumu yapilmis olmali. Aksi halde uygulama acilsa bile auth, pin listesi, realtime veya image upload tarafinda eksik davranis gorursun.

SQL dosyalarini su sirayla calistir:

1. `corteqs-env/supabase_setup.sql`
2. `corteqs-env/realtime_enable.sql`
3. `corteqs-env/p1_setup.sql`

### 4.1 Bu SQL'ler Ne Yapiyor?

`supabase_setup.sql`:

- `public.profiles` tablosunu olusturur
- `public.pins` tablosunu olusturur
- RLS'i etkinlestirir
- `pins` tablosunu `supabase_realtime` publication'a ekler

`realtime_enable.sql`:

- `pins` tablosunu tekrar `supabase_realtime` publication'a ekler
- `approved` durumundaki pinleri okuyabilmek icin `anyone reads approved pins` policy'sini olusturur

`p1_setup.sql`:

- `pins` tablosuna `image_url` kolonunu ekler
- `pins` tablosuna `description` kolonunu ekler
- `pin-images` bucket'ini olusturur
- Bu bucket icin public read policy tanimlar

### 4.2 Supabase'de Kurulum Sonrasi Hangi Yapilar Olmali?

Kurulum bittiginde asagidaki yapilar mevcut olmalidir:

- `public.profiles`
- `public.pins`
- `public.pins.image_url`
- `public.pins.description`
- `storage.buckets` icinde `pin-images`
- `public.pins` icin approved read policy

## 5. Coolify Icin Onerilen Yayin Modeli

Bu proje icin en temiz kurulum su sekildedir:

- Public domain sadece `frontend` servisine baglanir
- `backend` sadece Coolify ic aginda kalir
- `frontend` icindeki `nginx`, `/api` trafigini `backend:8001` adresine iletir

Onerilen domain modeli:

- Frontend public URL: `https://globe.example.com`
- Backend public URL: yok

Neden boyle?

- Tarayici tarafinda tek origin olur
- CORS daha az problem cikarir
- Frontend env'inde `REACT_APP_BACKEND_URL` tek bir public origin olarak kalir
- Backend'i disariya acmadan daha temiz bir topoloji kurulur

## 6. Coolify'da Uygulama Olusturma

Coolify uzerinde su akisi izle:

1. Yeni bir `Project` olustur.
2. Repo kaynagini bagla.
3. Yeni bir `Resource` ekle.
4. Resource tipi olarak `Docker Compose` sec.
5. Compose file olarak repo kokundeki `docker-compose.yml` dosyasini kullan.

Bu compose ile iki servis olusur:

- `backend`
- `frontend`

Beklenen davranis:

- `backend` ic agda `8001` uzerinden calisir
- `frontend` ic agda `80` uzerinden calisir
- public trafik sadece `frontend` uzerinden gider

## 7. Coolify Environment Variables Mantigi

Bu projede env degiskenleri iki farkli amaca hizmet eder:

1. Backend runtime env
2. Frontend build-time env

Bu ayrim cok onemli cunku React tarafindaki `REACT_APP_*` degiskenleri build sirasinda bundle'a gomulur. Yani bu degerler sonradan sadece container restart ile degismez; gerekiyorsa frontend image yeniden build edilmelidir.

## 8. Gerekli Environment Variables

### 8.1 Backend Icinde Gerekli Degiskenler

Asagidaki degerler backend tarafinda runtime env olarak bulunmali:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
GOOGLE_GEOCODING_API_KEY=your-google-geocoding-api-key
ADMIN_EMAILS=admin@example.com
CORS_ORIGINS=https://globe.example.com
```

Aciklamalar:

- `SUPABASE_URL`: Supabase proje URL'i
- `SUPABASE_ANON_KEY`: public auth isleri icin gerekli anahtar
- `SUPABASE_SERVICE_ROLE_KEY`: sadece backend kullanmali, frontend'e asla gitmemeli
- `GOOGLE_GEOCODING_API_KEY`: geocoding endpoint'i icin gerekli
- `ADMIN_EMAILS`: admin paneline girecek mailleri virgul ile ayirarak yaz
- `CORS_ORIGINS`: dokumantasyon amacli tutuyoruz; mevcut backend kodu su an bunu aktif sekilde uygulamiyor

### 8.2 Frontend Build Icinde Gerekli Degiskenler

Asagidaki degerler frontend build sirasinda verilmelidir:

```env
REACT_APP_BACKEND_URL=https://globe.example.com
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key
ENABLE_HEALTH_CHECK=false
```

Aciklamalar:

- `REACT_APP_BACKEND_URL`: frontend'in kullanacagi public origin
- `REACT_APP_SUPABASE_URL`: browser tarafinda Supabase baglanti URL'i
- `REACT_APP_SUPABASE_ANON_KEY`: browser tarafinda kullanilacak public key
- `ENABLE_HEALTH_CHECK=false`: production icin boyle birak

### 8.3 Bu Projede Kullanilmayan Legacy Degiskenler

Asagidaki degiskenler eski akis kalintisi olabilir, production'da gerekli degildir:

- `MONGO_URL`
- `DB_NAME`
- `WDS_SOCKET_PORT`

Sebep:

- Production veri katmani Supabase'tir
- Mongo container deploy edilmiyor
- `WDS_SOCKET_PORT` daha cok local dev senaryolarinda anlamlidir

## 9. Coolify'de Env'leri Nereye Girecegim?

Pratik onerilen yontem:

- Secret ve env degerlerini Coolify UI icinden gir
- Repodaki `.env.production` dosyasini referans olarak kullan
- Gercek secret'lari repo icine yazma

Onemli not:

- `docker-compose.yml` frontend build args olarak su degiskenleri bekliyor:
  - `REACT_APP_BACKEND_URL`
  - `REACT_APP_SUPABASE_URL`
  - `REACT_APP_SUPABASE_ANON_KEY`
  - `ENABLE_HEALTH_CHECK`

- `backend` servisi ise `.env.production` mantigindaki runtime env degerlerini bekliyor

Coolify uzerinde env tanimlarken dikkat et:

- Frontend icin gereken `REACT_APP_*` degerler bos kalirsa build basarili olsa bile uygulama runtime'da `undefined/api/...` gibi hatalar verebilir
- `SUPABASE_SERVICE_ROLE_KEY` frontend'e verilirse guvenlik acigi olusur

## 10. Bu Repodaki Docker Compose Dosyasinin Anlami

`docker-compose.yml` ozeti:

- `backend`
  - `./backend` altindan build edilir
  - `.env.production` benzeri env dosyasi bekler
  - `8001` portunu expose eder
  - health check olarak `http://localhost:8001/api/health` kullanir

- `frontend`
  - `./frontend` altindan build edilir
  - build args olarak `REACT_APP_*` degerlerini alir
  - `backend` servisine baglidir
  - `80` portunu expose eder

Buradaki kritik nokta:

- `frontend` icindeki `nginx.conf`, `/api` isteklerini `http://backend:8001/api/` adresine gonderir
- Bu ancak Coolify icinde servis adi gercekten `backend` olarak kaldiginda problemsiz calisir

## 11. Domain ve SSL Ayarlari

Coolify tarafinda:

1. Public domain'i sadece `frontend` servisine bagla
2. SSL veya Let's Encrypt'i aktif et
3. `backend` icin ayri public domain tanimlama

Beklenen sonuc:

- Kullanici sadece `https://globe.example.com` adresine gider
- API cagrilari `https://globe.example.com/api/...` olarak akar

## 12. Adim Adim Deploy Akisi

### 12.1 Supabase Kur

1. Supabase projesini ac
2. SQL Editor'a gir
3. `corteqs-env/supabase_setup.sql` calistir
4. `corteqs-env/realtime_enable.sql` calistir
5. `corteqs-env/p1_setup.sql` calistir

### 12.2 Coolify Resource'u Olustur

1. Repo'yu Coolify'ye bagla
2. `Docker Compose` resource olustur
3. Compose dosyasi olarak `docker-compose.yml` sec

### 12.3 Env'leri Gir

1. Backend env'lerini doldur
2. Frontend build env'lerini doldur
3. Bos veya hatali deger kalmadigini kontrol et

### 12.4 Domain Bagla

1. `frontend` servisine public domain bagla
2. SSL'i aktif et

### 12.5 Deploy Baslat

Deploy sirasinda loglarda yaklasik sunlari gormelisin:

- backend tarafinda `pip install -r requirements.txt`
- backend container start
- frontend tarafinda `npm install`
- frontend tarafinda `npm run build`
- nginx container start

## 13. Deploy Sonrasi Dogrulama

Deploy bitti diye is bitmis sayma. Asagidaki kontrolleri tek tek yap.

### 13.1 Ana Sayfa Aciliyor mu?

Tarayicida ac:

```text
https://globe.example.com/
```

Beklenen:

- React uygulamasi yuklenir
- refresh attiginda client-side route'lar bozulmaz

### 13.2 Health Endpoint Calisiyor mu?

```bash
curl https://globe.example.com/api/health
```

Beklenen:

```json
{"ok":true}
```

### 13.3 Public Pins Donuyor mu?

```bash
curl https://globe.example.com/api/pins
```

Beklenen:

- `200 OK`
- `pins` listesi

### 13.4 Supabase Auth Calisiyor mu?

Beklenen:

- signup calisir
- login calisir
- frontend session olusur

### 13.5 Image Upload Hazir mi?

Beklenen:

- `pin-images` bucket kullanilabilir
- public URL uretilebiliyor olmali

### 13.6 Realtime Beklenen Sekilde mi?

Beklenen:

- onayli pinler okunabilir olmali
- frontend realtime subscribe edebilmeli

## 14. En Sik Sorunlar ve Cozumleri

### 14.1 Uygulama Aciliyor Ama API Cagrilari `undefined/api/...` Gidiyor

Neredeyse her zaman sebep:

- `REACT_APP_BACKEND_URL` eksik
- veya frontend yeniden build edilmeden sadece restart yapildi

Cozum:

1. Coolify'de `REACT_APP_BACKEND_URL` degerini kontrol et
2. `REACT_APP_SUPABASE_URL` ve `REACT_APP_SUPABASE_ANON_KEY` degerlerini kontrol et
3. Frontend image'i yeniden build et

### 14.2 `/api/*` Istekleri 502 veya 504 Donuyor

Kontrol listesi:

1. `backend` container ayakta mi?
2. `backend` health check geciyor mu?
3. `frontend/nginx.conf` icinde upstream `backend:8001` mi?
4. Compose'daki servis adi gercekten `backend` mi?

### 14.3 `/api/health` 404 Donuyor

Muhtemel sebepler:

- public domain yanlis servise baglandi
- `frontend` yerine baska resource'a gidiyor
- nginx config beklenen image ile deploy edilmedi

### 14.4 Frontend Aciliyor Ama Auth Calismiyor

Kontrol:

- frontend ve backend ayni `SUPABASE_URL`'i kullaniyor mu
- `SUPABASE_ANON_KEY` dogru mu
- `SUPABASE_SERVICE_ROLE_KEY` backend'de dogru mu
- Supabase Email auth aktif mi

### 14.5 Image Upload Calismiyor

Kontrol:

- `p1_setup.sql` calisti mi
- `pin-images` bucket olustu mu
- storage policy var mi

### 14.6 Realtime Calismiyor

Kontrol:

- `realtime_enable.sql` calisti mi
- `pins` tablosu publication'a eklendi mi
- approved read policy var mi

### 14.7 Frontend Degisiklikleri Yansimiyor

Sebep:

- React env degerleri build-time oldugu icin sadece restart yetmez

Cozum:

- frontend icin rebuild + redeploy yap

### 14.8 `SUPABASE_SERVICE_ROLE_KEY` Yanlislikla Frontend'e Verildi

Bu kritik bir guvenlik hatasidir.

Hemen yapilacaklar:

1. Key'i frontend env'den kaldir
2. Gerekirse Supabase'den rotate et
3. Sadece backend runtime env olarak tut

## 15. Production Oncesi Son Kontrol Listesi

Deploy'u tamamlamadan once su checklist'i bitir:

- Supabase SQL'leri sirayla calisti
- `profiles`, `pins` tablolari mevcut
- `pin-images` bucket mevcut
- Coolify compose resource olustu
- Public domain sadece `frontend` servisine bagli
- SSL aktif
- `REACT_APP_BACKEND_URL` public frontend origin'ine ayarli
- `SUPABASE_SERVICE_ROLE_KEY` sadece backend'de
- `/api/health` 200 donuyor
- `/api/pins` 200 donuyor
- signup/login test edildi

## 16. Onerilen Ornek Env Seti

Asagidaki ornek sadece format gostermek icindir:

```env
# Backend
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_GEOCODING_API_KEY=your-google-key
ADMIN_EMAILS=admin@example.com,owner@example.com
CORS_ORIGINS=https://globe.example.com

# Frontend build
REACT_APP_BACKEND_URL=https://globe.example.com
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
ENABLE_HEALTH_CHECK=false
```

## 17. Coolify Disinda Local Kontrol Notu

Local compose denemesi yapmak istersen su iki noktayi unutma:

1. `docker-compose.yml` icindeki `${...}` alanlari compose interpolation ile cozulur
2. Bu yuzden `.env.production` degerlerinin compose tarafina gorundugunden emin olman gerekir

Ornek yaklasimlar:

1. `.env.production` dosyasini gecici olarak `.env` diye kullanmak
2. `docker compose --env-file .env.production config` ile sonuc kontrol etmek

## 18. Son Soz

Bu proje icin production mantigi "frontend public, backend private, Supabase external" seklindedir. Eger deployment'ta bir sey karisiyorsa genelde problem su uc alandan birindedir:

1. Supabase SQL kurulumu eksik
2. Frontend build env'leri eksik veya yanlis
3. Coolify domain/public servis kurgusu yanlis

Bu ucunu dogru kurdugunda deploy akisi stabil calisir.
