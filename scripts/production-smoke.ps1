param(
    [string]$BaseUrl = "https://globe.corteqs.net",
    [switch]$RunMutatingChecks,
    [switch]$RunFrontendBuild
)

$ErrorActionPreference = "Stop"

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-JsonRequest {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        $Body,
        [int]$TimeoutSec = 30,
        [string]$ContentType = "application/json"
    )

    $params = @{
        Method = $Method
        Uri = $Uri
        TimeoutSec = $TimeoutSec
    }

    if ($Headers) {
        $params.Headers = $Headers
    }

    if ($null -ne $Body) {
        if ($ContentType -eq "application/json") {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            $params.ContentType = "application/json"
        } else {
            $params.Body = $Body
            $params.ContentType = $ContentType
        }
    }

    return Invoke-RestMethod @params
}

function Test-FrontendBuild {
    Write-Section "Frontend Build"
    Push-Location (Join-Path $PSScriptRoot "..\\frontend")
    try {
        $env:REACT_APP_BACKEND_URL = $BaseUrl
        $env:REACT_APP_SUPABASE_URL = "https://hvzkpkhptgdbowucvypt.supabase.co"
        $env:REACT_APP_SUPABASE_ANON_KEY = "test-anon-key"
        $env:ENABLE_HEALTH_CHECK = "false"
        npm run build | Out-Host
    } finally {
        Pop-Location
    }
}

function Test-NonMutatingApi {
    Write-Section "Non-Mutating API Smoke"

    $health = Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/health" -Body $null
    Assert-True ($health.ok -eq $true) "/api/health did not return ok=true"
    Write-Host "PASS /api/health"

    $root = Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/" -Body $null
    Assert-True ($root.ok -eq $true) "/api/ did not return ok=true"
    Write-Host "PASS /api/"

    $pins = Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/pins" -Body $null
    Assert-True ($null -ne $pins.pins) "/api/pins did not return a pins array"
    Assert-True ($pins.pins.Count -ge 25) "Expected at least 25 approved pins, got $($pins.pins.Count)"
    $notApproved = @($pins.pins | Where-Object { $_.status -ne "approved" })
    Assert-True ($notApproved.Count -eq 0) "Public /api/pins included non-approved pins"
    Write-Host "PASS /api/pins ($($pins.pins.Count) approved pins)"

    $geoip = Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/geoip" -Body $null
    Assert-True ($null -ne $geoip.lat -and $null -ne $geoip.lng) "/api/geoip missing lat/lng"
    Write-Host "PASS /api/geoip ($($geoip.city), $($geoip.country_name))"

    $geocode = Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/geocode?q=Istanbul" -Body $null
    Assert-True ($geocode.results.Count -gt 0) "/api/geocode returned no results for Istanbul"
    Write-Host "PASS /api/geocode"

    try {
        Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/auth/me" -Body $null | Out-Null
        throw "/api/auth/me unexpectedly succeeded anonymously"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 401) {
            throw "/api/auth/me should return 401 anonymously"
        }
        Write-Host "PASS /api/auth/me anonymous 401"
    }
}

function New-TinyPngFile {
    $bytes = [byte[]](
        0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,
        0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
        0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
        0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,
        0x89,0x00,0x00,0x00,0x0D,0x49,0x44,0x41,
        0x54,0x78,0x9C,0x63,0x60,0x00,0x00,0x02,
        0x00,0x01,0x54,0xA2,0x4F,0x5D,0x00,0x00,
        0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42,
        0x60,0x82
    )
    $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) ("corteqs-smoke-" + [guid]::NewGuid().ToString() + ".png")
    [System.IO.File]::WriteAllBytes($tempPath, $bytes)
    return $tempPath
}

function Test-MutatingApi {
    Write-Section "Mutating Auth / Pin / Upload Smoke"

    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $email = "smoke_$ts@example.com"
    $password = "test123456"
    $name = "Smoke Test User"

    $signup = Invoke-JsonRequest -Method "POST" -Uri "$BaseUrl/api/auth/signup" -Body @{
        email = $email
        password = $password
        name = $name
    }
    Assert-True ([string]::IsNullOrWhiteSpace($signup.access_token) -eq $false) "Signup did not return access_token"
    Write-Host "PASS signup"

    $login = Invoke-JsonRequest -Method "POST" -Uri "$BaseUrl/api/auth/login" -Body @{
        email = $email
        password = $password
    }
    Assert-True ([string]::IsNullOrWhiteSpace($login.access_token) -eq $false) "Login did not return access_token"
    $token = $login.access_token
    $headers = @{ Authorization = "Bearer $token" }
    Write-Host "PASS login"

    $me = Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/auth/me" -Headers $headers -Body $null
    Assert-True ($me.email -eq $email) "/api/auth/me returned wrong email"
    Write-Host "PASS auth/me"

    $pin = Invoke-JsonRequest -Method "POST" -Uri "$BaseUrl/api/pins" -Headers $headers -Body @{
        type = "business"
        name = "Smoke Test Cafe"
        city = "Berlin"
        hood = "Mitte"
        description = "Production smoke pending pin"
        image_url = ""
        lat = 52.52
        lng = 13.405
    }
    Assert-True ($pin.pin.status -eq "pending") "Created pin should be pending"
    $pinId = $pin.pin.id
    Write-Host "PASS create pending pin"

    $publicPins = Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/pins" -Body $null
    $publicHit = @($publicPins.pins | Where-Object { $_.id -eq $pinId })
    Assert-True ($publicHit.Count -eq 0) "Pending pin leaked into public /api/pins"
    Write-Host "PASS pending hidden from public pins"

    $myPins = Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/pins/mine" -Headers $headers -Body $null
    $mineHit = @($myPins.pins | Where-Object { $_.id -eq $pinId })
    Assert-True ($mineHit.Count -eq 1) "Created pin missing from /api/pins/mine"
    Write-Host "PASS pins/mine"

    try {
        Invoke-JsonRequest -Method "GET" -Uri "$BaseUrl/api/pins/admin" -Headers $headers -Body $null | Out-Null
        throw "/api/pins/admin unexpectedly succeeded for non-admin user"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 403) {
            throw "/api/pins/admin should return 403 for non-admin user"
        }
        Write-Host "PASS admin guard"
    }

    $tinyPng = New-TinyPngFile
    try {
        Add-Type -AssemblyName System.Net.Http
        $client = [System.Net.Http.HttpClient]::new()
        $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)
        $content = [System.Net.Http.MultipartFormDataContent]::new()
        $bytes = [System.IO.File]::ReadAllBytes($tinyPng)
        $fileContent = [System.Net.Http.ByteArrayContent]::new($bytes)
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("image/png")
        $content.Add($fileContent, "file", "tiny.png")
        $response = $client.PostAsync("$BaseUrl/api/upload/pin-image", $content).GetAwaiter().GetResult()
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        Assert-True ($response.IsSuccessStatusCode) "Upload failed: $body"
        $upload = $body | ConvertFrom-Json
        Assert-True ($upload.url -match "^https://") "Upload response missing public URL"
        Write-Host "PASS upload/pin-image"
    } finally {
        if (Test-Path $tinyPng) {
            Remove-Item $tinyPng -Force
        }
    }

    $logout = Invoke-JsonRequest -Method "POST" -Uri "$BaseUrl/api/auth/logout" -Body $null
    Assert-True ($logout.ok -eq $true) "Logout did not return ok=true"
    Write-Host "PASS logout"
}

Write-Host "CorteQS Globe production smoke started against $BaseUrl" -ForegroundColor Green

Test-NonMutatingApi

if ($RunMutatingChecks) {
    Test-MutatingApi
} else {
    Write-Host ""
    Write-Host "Skipping mutating checks. Re-run with -RunMutatingChecks to exercise signup/login/pin/upload." -ForegroundColor Yellow
}

if ($RunFrontendBuild) {
    Test-FrontendBuild
} else {
    Write-Host ""
    Write-Host "Skipping frontend build. Re-run with -RunFrontendBuild to validate production bundle build." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Production smoke completed successfully." -ForegroundColor Green
