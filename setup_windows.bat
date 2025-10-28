@echo off
echo ========================================
echo Mobile Camera Receptor - Windows Setup
echo ========================================

echo.
echo 1. Installing Backend Dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Backend installation failed
    pause
    exit /b 1
)
echo ✅ Backend dependencies installed

echo.
echo 2. Installing Frontend Dependencies...
cd ..\frontend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Frontend installation failed
    pause
    exit /b 1
)
echo ✅ Frontend dependencies installed

echo.
echo 3. Installing NDI Bridge Dependencies...
cd ..\ndi-bridge
call pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ❌ NDI Bridge installation failed
    pause
    exit /b 1
)
echo ✅ NDI Bridge dependencies installed

echo.
echo 4. Setting up environment...
if not exist .env (
    copy windows.env .env
    echo ✅ Environment file created
    echo ⚠️  Please edit .env file with your Windows IP address
) else (
    echo ✅ Environment file already exists
)

echo.
echo 5. Testing NDI Installation...
python test_ndi_installation.py
if %errorlevel% neq 0 (
    echo ❌ NDI test failed - will use Docker solution
) else (
    echo ✅ NDI test passed - native implementation available
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Edit ndi-bridge\.env with your Windows IP address
echo 2. Run: start_servers.bat
echo 3. Open browser to: https://YOUR_IP:3000
echo.
pause
