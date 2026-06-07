@echo off
setlocal
cd /d "%~dp0"

set "PORT=4173"
set "URL=http://127.0.0.1:%PORT%/index.html"

start "Portafoglio privato" /min cmd /c "node local-server.cjs"
timeout /t 2 /nobreak >nul
start "" "%URL%"
