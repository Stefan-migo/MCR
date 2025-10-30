@echo off
echo ========================================
echo Starting Mobile Camera Receptor Servers
echo ========================================

echo.
echo Starting Backend Server...
start "Backend" cmd /k "cd /d %~dp0backend && npm run dev"

echo.
echo Starting Frontend Server (HTTPS)...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev:https"

echo.
echo Starting NDI Bridge...
start "NDI Bridge" cmd /k "cd /d %~dp0ndi-bridge && set PYTHONUTF8=1 && set BACKEND_URL=https://192.168.100.11:3001 && set BACKEND_WS_URL=wss://192.168.100.11:3001 && python src/main.py"

echo.
echo ========================================
echo All servers starting...
echo ========================================
echo.
echo Backend:  https://localhost:3001
echo Frontend: https://localhost:3000
echo NDI Bridge: http://localhost:8000
echo.
echo Mobile Access:
echo Frontend: https://192.168.100.11:3000
echo.
echo Check the terminal windows for any errors
echo Press any key to exit this window...
pause >nul
