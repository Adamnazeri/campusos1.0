@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; " ^
  "$Desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$Shortcut = $WshShell.CreateShortcut((Join-Path $Desktop 'CampusOS.lnk')); " ^
  "$Shortcut.TargetPath = 'wscript.exe'; " ^
  "$Shortcut.Arguments = '\"' + (Join-Path '%~dp0' 'CampusOS-Senyap.vbs') + '\"'; " ^
  "$Shortcut.WorkingDirectory = '%~dp0'; " ^
  "$Shortcut.IconLocation = (Join-Path '%~dp0' 'frontend\public\campusos.ico') + ',0'; " ^
  "$Shortcut.Description = 'Buka CampusOS: Sistem Pengurusan Sekolah'; " ^
  "$Shortcut.Save()"

echo.
echo ====================================================================
echo   BERJAYA! Ikon "CampusOS" telah dicipta pada Desktop anda.
echo   Selepas ini, hanya klik dua kali ikon CampusOS di Desktop untuk
echo   terus membuka laman web tanpa perlu membuka terminal.
echo ====================================================================
echo.
pause
