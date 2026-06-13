@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Starting Mobile Camera Receptor Servers
echo ========================================

:: ---------------------------------------------------------------
:: Step 1: Detect LAN IP via PowerShell
:: ---------------------------------------------------------------
echo.
echo [INFO] Detecting LAN IP address...

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { $ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'docker|vEthernet|Hyper-V|VirtualBox|VMware|vnic|vmnet|Loopback' -and $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } | Select-Object -First 1 -ExpandProperty IPAddress; if (-not $ip) { $ip = '127.0.0.1' }; Write-Output $ip } catch { Write-Output '127.0.0.1' }"`) do set "DETECTED_IP=%%i"

if "%DETECTED_IP%"=="" (
    set "DETECTED_IP=127.0.0.1"
)

echo    Detected IP: %DETECTED_IP%

:: ---------------------------------------------------------------
:: Step 2: Check SSL certificates
:: ---------------------------------------------------------------
echo.
echo [INFO] Checking SSL certificates...

set "CERT_FILE=cert.pem"
set "KEY_FILE=key.pem"
set "NEED_REGENERATION=0"

:: Check if certificate files exist
if not exist "%CERT_FILE%" (
    echo    Cert file missing
    set "NEED_REGENERATION=1"
)
if not exist "%KEY_FILE%" (
    echo    Key file missing
    set "NEED_REGENERATION=1"
)

:: If cert exists, check if CN matches detected IP
if "%NEED_REGENERATION%"=="0" (
    echo    Extracting CN from existing certificate...
    for /f "usebackq delims=" %%s in (`powershell -NoProfile -Command "try { $result = & openssl x509 -in cert.pem -noout -subject 2>$null; if ($LASTEXITCODE -eq 0) { Write-Output $result } else { Write-Output 'ERROR' } } catch { Write-Output 'ERROR' }"`) do set "CERT_SUBJECT=%%s"
    
    echo    Cert subject: !CERT_SUBJECT!
    
    :: Check if CN matches detected IP
    echo !CERT_SUBJECT! | findstr /C:"CN=%DETECTED_IP%" >nul
    if errorlevel 1 (
        echo    Certificate CN does not match detected IP.
        set "NEED_REGENERATION=1"
    ) else (
        echo    Certificate matches detected IP.
    )
)

:: Regenerate if needed
if "%NEED_REGENERATION%"=="1" (
    echo.
    echo [INFO] Regenerating SSL certificates for %DETECTED_IP%...
    
    :: Check if openssl is available
    where openssl >nul 2>nul
    if errorlevel 1 (
        echo [WARNING] openssl not found. Skipping certificate regeneration.
        echo    SSL certificates will not be valid for the current IP.
        echo    Install openssl or run: generate-certs.sh %DETECTED_IP%
    ) else (
        echo    Generating new certificate with IP %DETECTED_IP%...
        openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes ^
            -subj "/C=US/ST=State/L=City/O=MobileCameraReceptor/CN=%DETECTED_IP%" ^
            -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:%DETECTED_IP%,IP:0.0.0.0"
        
        if errorlevel 1 (
            echo [ERROR] Failed to generate SSL certificates.
        ) else (
            echo    SSL certificates regenerated successfully.
        )
    )
)

:: ---------------------------------------------------------------
:: Step 3: Copy certificates to service directories
:: ---------------------------------------------------------------
echo.
echo [INFO] Copying certificates to services...

if exist "%CERT_FILE%" if exist "%KEY_FILE%" (
    copy /Y "%CERT_FILE%" "backend\cert.pem" >nul 2>nul && echo    Copied to backend\ || echo    [WARN] Could not copy to backend\
    copy /Y "%KEY_FILE%" "backend\key.pem" >nul 2>nul
    
    copy /Y "%CERT_FILE%" "frontend\cert.pem" >nul 2>nul && echo    Copied to frontend\ || echo    [WARN] Could not copy to frontend\
    copy /Y "%KEY_FILE%" "frontend\key.pem" >nul 2>nul
) else (
    echo    [WARN] Certificate files not found after regeneration attempt.
)

:: ---------------------------------------------------------------
:: Step 4: Start services
:: ---------------------------------------------------------------
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
echo Frontend: https://%DETECTED_IP%:3000
echo.
echo Check the terminal windows for any errors
echo Press any key to exit this window...
pause >nul

endlocal
