@echo off
cd /d "%~dp0"
echo CampusOS pilot (percuma). Jangan tutup tetingkap ini semasa waktu sekolah.
node scripts/pilot.mjs %*
pause
