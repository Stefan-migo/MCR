# Complete Testing Guide for Mobile Camera Receptor

This guide will help you test the backend, frontend, and OBS Browser Source integration.

## Prerequisites

- ✅ Your new LAN IP: **192.168.0.138**
- ✅ SSL certificates generated for this IP
- ✅ All configuration files updated
- ✅ Backend and frontend dependencies installed

## Step 1: Generate SSL Certificates

**First, generate SSL certificates for your new IP:**

### Option A: Using Git Bash (Recommended)
```bash
./generate-certs.sh 192.168.0.138
```

### Option B: Manual Generation
If you have OpenSSL installed:
```bash
openssl req -x509 -newkey rsa:4096 \
    -keyout key.pem \
    -out cert.pem \
    -days 365 \
    -nodes \
    -subj "/C=US/ST=State/L=City/O=MobileCameraReceptor/CN=192.168.0.138" \
    -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:192.168.0.138,IP:0.0.0.0"
```

**Verify certificates were created:**
```bash
ls -la cert.pem key.pem
ls -la backend/cert.pem backend/key.pem
ls -la frontend/cert.pem frontend/key.pem
```

## Step 2: Test Backend

### 2.1 Start Backend

**Option A: Using start script (Git Bash)**
```bash
./start-backend.sh
```

**Option B: Manual start**
```bash
cd backend
export NODE_ENV=development
export MEDIASOUP_ANNOUNCED_IP=192.168.0.138
npm run dev
```

**Expected Output:**
```
✅ Mediasoup router initialized
🚀 Backend server running on https://0.0.0.0:3001
📡 Socket.IO server ready
```

### 2.2 Test Backend Health Endpoint

**In Browser:**
- Open: `https://192.168.0.138:3001/health`
- Accept the security warning
- Should see: `{"status":"ok"}`

**Or using curl (PowerShell):**
```powershell
curl -k https://192.168.0.138:3001/health
```

**Expected Response:**
```json
{"status":"ok"}
```

### 2.3 Test RTP Capabilities Endpoint

**In Browser:**
- Open: `https://192.168.0.138:3001/api/rtp-capabilities`
- Should see JSON with codec information

**Or using curl:**
```powershell
curl -k https://192.168.0.138:3001/api/rtp-capabilities
```

**Expected Response:**
```json
{
  "codecs": [...],
  "headerExtensions": [...],
  "fecMechanisms": [...]
}
```

### 2.4 Test Streams Endpoint

**In Browser:**
- Open: `https://192.168.0.138:3001/api/streams`
- Should see empty array if no streams: `[]`
- Or array of stream objects if streams are active

### 2.5 Backend Test Checklist

- [ ] Backend starts without errors
- [ ] No NDI-related errors in console
- [ ] Health endpoint responds with `{"status":"ok"}`
- [ ] RTP capabilities endpoint returns JSON
- [ ] Streams endpoint accessible (may be empty)

## Step 3: Test Frontend

### 3.1 Start Frontend

**Option A: Using start script (Git Bash)**
```bash
./start-frontend.sh
```

**Option B: Manual start**
```bash
cd frontend
export NEXT_PUBLIC_API_URL=https://192.168.0.138:3001
export NEXT_PUBLIC_WS_URL=wss://192.168.0.138:3001
npm run dev:https
```

**Expected Output:**
```
🔒 HTTPS certificates found
ready - started server on 0.0.0.0:3000, url: https://localhost:3000
```

### 3.2 Test Landing Page

1. **Open Browser:**
   - Go to: `https://192.168.0.138:3000`
   - Accept the security warning (self-signed certificate)
   - Click "Advanced" → "Proceed to site"

2. **Expected Result:**
   - Landing page loads
   - Two cards visible: "Mobile Stream" and "Dashboard"
   - No console errors (check with F12)

### 3.3 Test Dashboard Page

1. **Open Dashboard:**
   - Go to: `https://192.168.0.138:3000/dashboard`
   - Or click "Dashboard" card on landing page

2. **Expected Result:**
   - Dashboard loads
   - May be empty if no streams
   - Grid/list view toggle visible
   - No console errors

### 3.4 Frontend Test Checklist

- [ ] Frontend starts without errors
- [ ] Landing page loads at `https://192.168.0.138:3000`
- [ ] Dashboard loads at `https://192.168.0.138:3000/dashboard`
- [ ] No console errors in browser
- [ ] HTTPS working (padlock icon with warning)

## Step 4: Test Mobile Streaming

### 4.1 Connect Mobile Device

1. **Ensure Same Network:**
   - Mobile device must be on same WiFi network
   - Check mobile device IP is in same range (192.168.0.x)

2. **Open Stream Page:**
   - On mobile browser, go to: `https://192.168.0.138:3000`
   - Accept security warning
   - Click "Mobile Stream" card

### 4.2 Start Streaming

1. **Grant Permissions:**
   - Browser will ask for camera permission
   - Click "Allow"
   - Browser may ask for microphone permission (optional)

2. **Connect:**
   - Click "Connect" or "Start Streaming" button
   - Wait for connection (should be < 5 seconds)

3. **Verify Stream:**
   - Video preview should appear on mobile device
   - Check connection status indicator (should show "Connected")

### 4.3 Verify in Dashboard

1. **On Desktop:**
   - Open: `https://192.168.0.138:3000/dashboard`
   - Your mobile stream should appear in the grid/list

2. **Expected Result:**
   - Stream card appears with device name
   - Video preview shows mobile camera feed
   - Stream status shows "Live Stream"
   - Statistics visible (bitrate, latency, etc.)

### 4.4 Mobile Streaming Test Checklist

- [ ] Mobile device can access `https://192.168.0.138:3000`
- [ ] Camera permission granted
- [ ] Stream connects successfully
- [ ] Video preview appears on mobile
- [ ] Stream appears in desktop dashboard
- [ ] Video quality is good
- [ ] Statistics update in real-time

## Step 5: Test OBS Browser Source

### 5.1 Prepare Dashboard

1. **Verify Dashboard is Working:**
   - Open dashboard in regular browser: `https://192.168.0.138:3000/dashboard`
   - Accept certificate warning
   - Verify streams are visible
   - Keep this browser window open (don't close it)

### 5.2 Install OBS Studio (If Not Installed)

1. **Download OBS Studio:**
   - Visit: https://obsproject.com/download
   - Download and install latest version

2. **Verify Installation:**
   - Launch OBS Studio
   - Should open without errors

### 5.3 Add Browser Source

1. **Create/Select Scene:**
   - In OBS, create a new scene or select existing
   - Name it: "Mobile Camera Streams"

2. **Add Browser Source:**
   - Click "+" button in Sources panel
   - Select "Browser Source"
   - Name it: "Mobile Camera Streams"
   - Click "OK"

### 5.4 Configure Browser Source

1. **Basic Settings:**
   - **URL**: `https://192.168.0.138:3000/dashboard`
   - **Width**: `1920`
   - **Height**: `1080`
   - Leave other settings as default

2. **Advanced Settings:**
   - Check "Shutdown source when not visible" (optional, saves resources)
   - Check "Refresh browser when scene becomes active" (recommended)
   - Check "Control audio via OBS" (if you have audio)

3. **Click "OK"**

### 5.5 Handle Certificate Warning

1. **If OBS Shows Certificate Error:**
   - First, open the dashboard URL in Chrome/Edge browser
   - Accept the certificate warning there
   - Close that browser window
   - Refresh the Browser Source in OBS (right-click → Refresh)

2. **Alternative: Install Certificate:**
   - Export certificate from browser
   - Install in Windows certificate store
   - OBS will trust it automatically

### 5.6 Verify Streams in OBS

1. **Check Browser Source:**
   - Browser Source should show dashboard
   - Mobile camera streams should be visible
   - Video should be playing smoothly

2. **Test Multiple Streams:**
   - Connect multiple mobile devices
   - All streams should appear in OBS Browser Source
   - Grid layout should work correctly

### 5.7 OBS Browser Source Test Checklist

- [ ] OBS Studio installed and running
- [ ] Browser Source added to scene
- [ ] URL configured correctly
- [ ] Certificate accepted (no errors)
- [ ] Dashboard visible in OBS
- [ ] Mobile streams appear in OBS
- [ ] Video quality is good
- [ ] No stuttering or lag

## Step 6: Complete System Test

### 6.1 Multiple Devices Test

1. **Connect 2-3 Mobile Devices:**
   - Each device opens: `https://192.168.0.138:3000/stream`
   - Start streaming from each device
   - Verify all streams appear in dashboard
   - Verify all streams appear in OBS

2. **Expected Result:**
   - All streams visible simultaneously
   - Each stream has unique device name
   - Video quality maintained for all streams
   - No performance degradation

### 6.2 Performance Test

1. **Monitor Resources:**
   - Check CPU usage (should be < 50% per stream)
   - Check memory usage
   - Check network bandwidth

2. **Test Duration:**
   - Run streams for 5-10 minutes
   - Verify stability
   - Check for memory leaks

### 6.3 Network Test

1. **Test Different Networks:**
   - Test on same WiFi (LAN)
   - Test on different network (if applicable)

2. **Verify Latency:**
   - Check latency indicators in dashboard
   - Should be < 500ms for LAN
   - Should be < 1000ms for internet

## Troubleshooting Common Issues

### Backend Won't Start

**Check:**
- Port 3001 is not in use: `netstat -ano | findstr :3001`
- Certificates exist in `backend/` directory
- Node.js version is 18+ (`node --version`)
- Dependencies installed (`cd backend && npm install`)

**Fix:**
```bash
# Kill process using port 3001
# Windows: Find PID with netstat, then: taskkill /PID <PID> /F

# Regenerate certificates
./generate-certs.sh 192.168.0.138

# Reinstall dependencies
cd backend && npm install
```

### Frontend Won't Start

**Check:**
- Port 3000 is not in use
- Certificates exist in `frontend/` directory
- Environment variables are set correctly

**Fix:**
```bash
# Kill process using port 3000
# Regenerate certificates
./generate-certs.sh 192.168.0.138

# Check environment
echo $NEXT_PUBLIC_API_URL  # Should be https://192.168.0.138:3001
```

### Mobile Can't Connect

**Check:**
- Mobile device is on same WiFi network
- Mobile can access `https://192.168.0.138:3000` in browser
- Backend is running
- Firewall allows connections

**Fix:**
- Verify WiFi network match
- Check Windows Firewall settings
- Try accessing backend directly: `https://192.168.0.138:3001/health`

### OBS Browser Source Shows Black Screen

**Check:**
- Dashboard URL is correct
- Dashboard works in regular browser
- Certificate is accepted

**Fix:**
1. Open dashboard in Chrome/Edge first
2. Accept certificate warning
3. Refresh Browser Source in OBS
4. Check OBS log (Help → Log Files)

### Streams Don't Appear

**Check:**
- WebRTC connection established
- Backend logs show producer created
- Browser console has no errors

**Fix:**
- Check browser console (F12) for errors
- Check backend logs for connection errors
- Verify WebRTC is not blocked by firewall

## Quick Test Commands

```bash
# Test backend health
curl -k https://192.168.0.138:3001/health

# Test RTP capabilities
curl -k https://192.168.0.138:3001/api/rtp-capabilities

# Test streams
curl -k https://192.168.0.138:3001/api/streams

# Check if ports are in use (Windows)
netstat -ano | findstr :3001
netstat -ano | findstr :3000
```

## Success Criteria

✅ **Backend:**
- Starts without errors
- Health endpoint responds
- No NDI-related code references

✅ **Frontend:**
- Loads in browser
- Dashboard accessible
- No console errors

✅ **Mobile Streaming:**
- Device connects successfully
- Video stream appears
- Stream visible in dashboard

✅ **OBS Integration:**
- Browser Source shows dashboard
- Mobile streams appear in OBS
- Video quality is good
- Low latency maintained

## Next Steps

After successful testing:

1. **Production Setup:**
   - Use valid SSL certificates (Let's Encrypt)
   - Configure firewall rules
   - Set up monitoring

2. **Optimization:**
   - Tune video quality settings
   - Optimize for your network
   - Configure OBS scenes

3. **Documentation:**
   - Document your specific setup
   - Create runbook for your team
   - Save IP configuration

---

**Your Configuration:**
- **LAN IP**: 192.168.0.138
- **Frontend**: https://192.168.0.138:3000
- **Backend**: https://192.168.0.138:3001
- **Dashboard**: https://192.168.0.138:3000/dashboard

**Status**: Ready for Testing 🚀

