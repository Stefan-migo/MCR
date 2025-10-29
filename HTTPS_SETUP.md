# HTTPS Setup Guide

## Overview

This guide explains how HTTPS is configured for the Mobile Camera Receptor project to enable mobile camera access.

## Why HTTPS?

**Mobile cameras require HTTPS** because:
- Modern browsers (especially iOS Safari) block camera/microphone access on HTTP
- Security requirements for getUserMedia API
- Required for production deployments

## Certificate Generation

### Automatic (Recommended)

The `start-all.sh` script automatically generates certificates if they don't exist:

```bash
./start-all.sh
```

### Manual Generation

Generate SSL certificates manually using:

```bash
./generate-certs.sh 192.168.100.19
```

Or use openssl directly:

```bash
openssl req -x509 -newkey rsa:4096 \
    -keyout key.pem \
    -out cert.pem \
    -days 365 \
    -nodes \
    -subj "/C=US/ST=State/L=City/O=MobileCameraReceptor/CN=192.168.100.19" \
    -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:192.168.100.19,IP:0.0.0.0"
```

## Certificate Locations

Certificates are automatically copied to:

1. **Root directory**: `cert.pem` and `key.pem`
2. **Backend directory**: `backend/cert.pem` and `backend/key.pem`
3. **Frontend directory**: `frontend/cert.pem` and `frontend/key.pem`

## Service Configuration

### Backend (Port 3001)

- **HTTP**: `http://0.0.0.0:3001`
- **HTTPS**: `https://0.0.0.0:3001` (when certificates found)
- Checks multiple paths: `/app/` (Docker), `backend/`, root directory

### Frontend (Port 3000)

- **HTTP**: `http://0.0.0.0:3000` (fallback if no certificates)
- **HTTPS**: `https://0.0.0.0:3000` (when certificates found)
- Uses `server.js` for HTTPS support

## Browser Security Warning

⚠️ **Self-signed certificates will show a security warning in browsers.**

This is **normal and expected** for development. To proceed:

1. Click **"Advanced"** or **"Show Details"**
2. Click **"Proceed to site"** or **"Accept the Risk"**
3. The site will load with HTTPS enabled

### Mobile Browsers

On mobile devices:
- **iOS Safari**: Tap "Show Details" → "visit this website"
- **Android Chrome**: Tap "Advanced" → "Proceed"

## Access URLs

Once HTTPS is enabled, access the services at:

- **Frontend**: `https://192.168.100.19:3000`
- **Backend API**: `https://192.168.100.19:3001`
- **WebSocket**: `wss://192.168.100.19:3001`

## Troubleshooting

### Certificates Not Found

If services start in HTTP mode:

1. **Check certificate existence**:
   ```bash
   ls -la cert.pem key.pem
   ls -la backend/cert.pem backend/key.pem
   ls -la frontend/cert.pem frontend/key.pem
   ```

2. **Regenerate certificates**:
   ```bash
   ./generate-certs.sh 192.168.100.19
   ```

3. **Verify openssl is installed**:
   ```bash
   openssl version
   ```

### Backend Still Using HTTP

Check backend logs for:
- `Checking certificates...`
- `Cert path: ...`
- `Key path: ...`

If paths show "not found", certificates weren't copied correctly.

### Frontend Still Using HTTP

The frontend falls back to HTTP if:
- Certificates are missing in `frontend/` directory
- `server.js` encounters an error reading certificates

Check `frontend/server.js` logs for certificate errors.

### NDI Bridge Connection Errors

If NDI Bridge shows SSL errors:
- Ensure backend is running on HTTPS (not HTTP)
- Check `BACKEND_WS_URL` environment variable
- Should be `wss://` not `ws://` when using HTTPS

## Production Deployment

For production, replace self-signed certificates with:
- **Let's Encrypt** certificates (free, automatic renewal)
- **Commercial SSL certificates**
- **Certificates from your organization's CA**

Update certificate paths in:
- `backend/src/server.ts`
- `frontend/server.js`
- Docker configurations

## Environment Variables

Set these for HTTPS:

```bash
# Backend
BACKEND_HOST=0.0.0.0
BACKEND_PORT=3001
MEDIASOUP_ANNOUNCED_IP=192.168.100.19

# Frontend
NEXT_PUBLIC_API_URL=https://192.168.100.19:3001
NEXT_PUBLIC_WS_URL=wss://192.168.100.19:3001

# NDI Bridge
BACKEND_URL=https://192.168.100.19:3001
BACKEND_WS_URL=wss://192.168.100.19:3001
```

## Verification

Test HTTPS is working:

1. **Backend health check**:
   ```bash
   curl -k https://192.168.100.19:3001/health
   ```

2. **Frontend access**:
   Open `https://192.168.100.19:3000` in browser

3. **Check camera access**:
   Navigate to `/stream` page and try to start camera
   - Should prompt for camera permission (HTTPS required)
   - Should NOT show "camera access requires HTTPS" error

