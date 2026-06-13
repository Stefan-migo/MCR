#!/bin/bash

echo "========================================"
echo "Starting Mobile Camera Receptor Servers"
echo "========================================"

# ---------------------------------------------------------------
# Step 1: Detect LAN IP
# ---------------------------------------------------------------
echo ""
echo "[INFO] Detecting LAN IP address..."

# Try Linux detection first (ip route), fallback to PowerShell for Git Bash/WSL
if command -v ip &> /dev/null && ip route get 1 &>/dev/null 2>&1; then
    DETECTED_IP=$(ip route get 1 | awk '{print $NF; exit}' 2>/dev/null)
elif command -v powershell &> /dev/null; then
    DETECTED_IP=$(powershell -NoProfile -Command "
        try {
            \$ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
                \$_.InterfaceAlias -notmatch 'docker|vEthernet|Hyper-V|VirtualBox|VMware|vnic|vmnet|Loopback' -and
                \$_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
            } | Select-Object -First 1 -ExpandProperty IPAddress
            if (-not \$ip) { \$ip = '127.0.0.1' }
            Write-Output \$ip
        } catch { Write-Output '127.0.0.1' }
    ")
elif command -v hostname &> /dev/null; then
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

if [ -z "$DETECTED_IP" ]; then
    DETECTED_IP="127.0.0.1"
fi

echo "   Detected IP: $DETECTED_IP"

# ---------------------------------------------------------------
# Step 2: Check SSL certificates
# ---------------------------------------------------------------
echo ""
echo "[INFO] Checking SSL certificates..."

CERT_FILE="cert.pem"
KEY_FILE="key.pem"
NEED_REGENERATION=0

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "   Certificate files missing"
    NEED_REGENERATION=1
else
    echo "   Extracting CN from existing certificate..."
    if command -v openssl &> /dev/null; then
        CERT_SUBJECT=$(openssl x509 -in "$CERT_FILE" -noout -subject 2>/dev/null)
        echo "   Cert subject: $CERT_SUBJECT"
        if echo "$CERT_SUBJECT" | grep -q "CN=$DETECTED_IP"; then
            echo "   Certificate matches detected IP."
        else
            echo "   Certificate CN does not match detected IP."
            NEED_REGENERATION=1
        fi
    else
        echo "   [WARN] openssl not available — cannot verify certificate."
        NEED_REGENERATION=1
    fi
fi

# Regenerate if needed
if [ "$NEED_REGENERATION" -eq 1 ]; then
    echo ""
    echo "[INFO] Regenerating SSL certificates for $DETECTED_IP..."

    if command -v openssl &> /dev/null; then
        echo "   Generating new certificate with IP $DETECTED_IP..."
        openssl req -x509 -newkey rsa:4096 \
            -keyout "$KEY_FILE" \
            -out "$CERT_FILE" \
            -days 365 \
            -nodes \
            -subj "/C=US/ST=State/L=City/O=MobileCameraReceptor/CN=$DETECTED_IP" \
            -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:$DETECTED_IP,IP:0.0.0.0"

        if [ $? -ne 0 ]; then
            echo "   [ERROR] Failed to generate SSL certificates."
        else
            echo "   SSL certificates regenerated successfully."
        fi
    else
        echo "   [WARNING] openssl not found. Skipping certificate regeneration."
        echo "   SSL certificates will not be valid for the current IP."
        echo "   Install openssl or run: ./generate-certs.sh $DETECTED_IP"
    fi
fi

# ---------------------------------------------------------------
# Step 3: Copy certificates to service directories
# ---------------------------------------------------------------
echo ""
echo "[INFO] Copying certificates to services..."

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    cp -f "$CERT_FILE" "$KEY_FILE" backend/ 2>/dev/null && echo "   Copied to backend/" || echo "   [WARN] Could not copy to backend/"
    cp -f "$CERT_FILE" "$KEY_FILE" frontend/ 2>/dev/null && echo "   Copied to frontend/" || echo "   [WARN] Could not copy to frontend/"
else
    echo "   [WARN] Certificate files not found after regeneration attempt."
fi

# ---------------------------------------------------------------
# Step 4: Start services
# ---------------------------------------------------------------
echo ""
echo "Starting Backend Server..."
cmd.exe /c "start \"Backend\" cmd /k \"cd /d %~dp0backend && npm run dev\""

echo ""
echo "Starting Frontend Server (HTTPS)..."
cmd.exe /c "start \"Frontend\" cmd /k \"cd /d %~dp0frontend && npm run dev:https\""

echo ""
echo "========================================"
echo "All servers starting..."
echo "========================================"
echo ""
echo "Backend:  https://localhost:3001"
echo "Frontend: https://localhost:3000"
echo ""
echo "Mobile Access:"
echo "Frontend: https://$DETECTED_IP:3000"
echo ""
echo "Check the terminal windows for any errors"
echo "Press any key to exit this window..."
read -n 1
