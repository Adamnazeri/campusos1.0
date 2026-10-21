@echo off
setlocal
cd /d "%~dp0"
title CampusOS Launcher

REM Semak sama ada pelayan sudah berjalan di port 5174
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5174' -UseBasicParsing -TimeoutSec 1; exit 0 } catch { exit 1 }"
if %errorlevel% equ 0 (
    start "" "http://localhost:5174"
    exit /b 0
)

REM Mulakan pelayan di latar belakang (minimized) dan tunggu sehingga sedia
start "CampusOS Server" /min cmd /c "npm run dev"

echo Sedang memulakan CampusOS, sila tunggu sebentar...
powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { try { $r = Invoke-WebRequest -Uri 'http://localhost:5174' -UseBasicParsing -TimeoutSec 1; break } catch { Start-Sleep -Seconds 1 } }"

start "" "http://localhost:5174"
