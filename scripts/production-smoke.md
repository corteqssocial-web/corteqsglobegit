# Production Smoke

Bu script canlı ortam için tekrar çalıştırılabilir bir smoke/regression yardımcı aracıdır.

Dosya:

- `scripts/production-smoke.ps1`

## Ne kontrol eder

Varsayılan, non-mutating çalışma:

- `GET /api/health`
- `GET /api/`
- `GET /api/pins`
- `GET /api/geoip`
- `GET /api/geocode?q=Istanbul`
- anonymous `GET /api/auth/me` -> `401`

Opsiyonel, mutating çalışma:

- signup
- login
- authenticated `/api/auth/me`
- pending pin oluşturma
- pending pinin public listede görünmediğini doğrulama
- `pins/mine`
- non-admin `pins/admin` -> `403`
- görsel upload
- logout

Opsiyonel build doğrulama:

- frontend production build

## Kullanım

Sadece güvenli smoke:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\production-smoke.ps1
```

Auth/pin/upload dahil:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\production-smoke.ps1 -RunMutatingChecks
```

Frontend build dahil:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\production-smoke.ps1 -RunFrontendBuild
```

Hepsi birlikte:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\production-smoke.ps1 -RunMutatingChecks -RunFrontendBuild
```

Farklı hedef URL ile:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\production-smoke.ps1 -BaseUrl https://globe.corteqs.net
```

## Notlar

- `-RunMutatingChecks` canlı ortamda test kullanıcısı, `pending` pin ve storage upload üretir.
- Script admin-only onay/red/silme veya browser tabanlı realtime UI davranışını test etmez.
- Google OAuth browser davranışı ve `Buraya yakınlaş` gibi görsel etkileşimler hala gerçek browser smoke ile ayrıca doğrulanmalıdır.
