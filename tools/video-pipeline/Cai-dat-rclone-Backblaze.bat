@echo off
setlocal
cd /d "%~dp0"
echo Tool nay se mo rclone config de ban tu nhap Backblaze B2 key tren may.
echo Khong gui key cho ai trong chat.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$config=Get-Content -LiteralPath '%~dp0config.json' -Raw | ConvertFrom-Json; $r=[Environment]::ExpandEnvironmentVariables([string]$config.rclonePath); if (-not $r -or -not (Test-Path -LiteralPath $r)) { $cmd=Get-Command rclone -ErrorAction SilentlyContinue; if ($cmd) { $r=$cmd.Source } }; if (-not $r -or -not (Test-Path -LiteralPath $r)) { throw 'Khong tim thay rclone.exe. Hay sua rclonePath trong config.json.' }; & $r config"
echo.
pause
