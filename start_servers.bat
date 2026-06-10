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
echo ========================================
echo All servers starting...
echo ========================================
echo.
echo Backend:  https://localhost:3001
echo Frontend: https://localhost:3000
echo.
echo Mobile Access:
echo Frontend: https://192.168.0.138:3000
echo.
echo Check the terminal windows for any errors
echo Press any key to exit this window...
pause >nul
