@echo off
echo ========================================
echo Starting Mobile Camera Receptor Servers
echo ========================================

echo.
echo Starting Backend Server...
start "Backend" cmd /k "cd backend && npm run dev"

echo.
echo Starting Frontend Server...
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Starting NDI Bridge...
start "NDI Bridge" cmd /k "cd ndi-bridge && python src/main.py"

echo.
echo ========================================
echo All servers starting...
echo ========================================
echo.
echo Backend:  https://localhost:3001
echo Frontend: https://localhost:3000
echo NDI Bridge: http://localhost:8000
echo.
echo Check the terminal windows for any errors
echo Press any key to exit this window...
pause >nul
