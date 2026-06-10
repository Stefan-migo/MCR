# Setup Guide for New LAN IP: 192.168.0.138

This guide will help you configure the system for your new LAN IP address and test everything.

## Step 1: Generate New SSL Certificates

Your new IP address is: **192.168.0.138**

Generate new SSL certificates for this IP:

```bash
# In PowerShell or Git Bash
./generate-certs.sh 192.168.0.138
```

Or manually:
```bash
openssl req -x509 -newkey rsa:4096 \
    -keyout key.pem \
    -out cert.pem \
    -days 365 \
    -nodes \
    -subj "/C=US/ST=State/L=City/O=MobileCameraReceptor/CN=192.168.0.138" \
    -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:192.168.0.138,IP:0.0.0.0"
```

## Step 2: Update Configuration Files

I'll update the key files automatically. The following files need the new IP:

- `start-all.sh` - Main startup script
- `start-backend.sh` - Backend startup
- `start-frontend.sh` - Frontend startup
- `start_servers.sh` - Windows server script
- `start_servers.bat` - Windows batch script
- `docker-compose.yml` - Docker configuration
- `setup-local-dev.sh` - Setup script

## Step 3: Test Backend

1. **Start Backend:**
   ```bash
   ./start-backend.sh
   ```

2. **Check Backend Health:**
   Open browser or use curl:
   ```
   https://192.168.0.138:3001/health
   ```

   Or in PowerShell:
   ```powershell
   curl -k https://192.168.0.138:3001/health
   ```

3. **Check RTP Capabilities:**
   ```
   https://192.168.0.138:3001/api/rtp-capabilities
   ```

4. **Expected Results:**
   - Backend should start without errors
   - Health endpoint should return `{"status":"ok"}`
   - No NDI-related errors in console

## Step 4: Test Frontend

1. **Start Frontend:**
   ```bash
   ./start-frontend.sh
   ```

2. **Open Dashboard:**
   - Open browser: `https://192.168.0.138:3000`
   - Accept the security warning (self-signed certificate)
   - You should see the landing page

3. **Test Dashboard:**
   - Navigate to: `https://192.168.0.138:3000/dashboard`
   - Dashboard should load (may be empty if no streams)

4. **Expected Results:**
   - Frontend loads without errors
   - Dashboard page accessible
   - No console errors in browser

## Step 5: Test Mobile Streaming

1. **On Mobile Device:**
   - Connect to same WiFi network
   - Open browser: `https://192.168.0.138:3000`
   - Accept security warning
   - Click "Mobile Stream" card

2. **Start Streaming:**
   - Allow camera/microphone permissions
   - Click "Connect" or "Start Streaming"
   - Video should appear in preview

3. **Check Dashboard:**
   - On desktop, open: `https://192.168.0.138:3000/dashboard`
   - Your mobile stream should appear in the dashboard

4. **Expected Results:**
   - Mobile device connects successfully
   - Video stream appears in mobile preview
   - Stream appears in dashboard on desktop

## Step 6: Test OBS Browser Source

1. **Verify Dashboard is Accessible:**
   - Open dashboard in regular browser first: `https://192.168.0.138:3000/dashboard`
   - Accept certificate warning
   - Verify streams are visible

2. **Open OBS Studio:**
   - Launch OBS Studio
   - Create a new scene (or use existing)

3. **Add Browser Source:**
   - Click "+" in Sources panel
   - Select "Browser Source"
   - Name it: "Mobile Camera Streams"
   - Click "OK"

4. **Configure Browser Source:**
   - **URL**: `https://192.168.0.138:3000/dashboard`
   - **Width**: `1920`
   - **Height**: `1080`
   - Check "Shutdown source when not visible" (optional)
   - Check "Refresh browser when scene becomes active" (recommended)

5. **Accept Certificate:**
   - If OBS shows certificate warning:
     - First open the URL in Chrome/Edge and accept the certificate
     - Then OBS should trust it

6. **Expected Results:**
   - Browser Source shows dashboard
   - Mobile camera streams appear in OBS
   - Video quality is good
   - No black screen

## Troubleshooting

### Backend Issues

**Problem**: Backend won't start
- Check if port 3001 is already in use
- Verify certificates exist in `backend/` directory
- Check environment variables are set correctly

**Problem**: Backend starts but health check fails
- Verify firewall allows port 3001
- Check backend logs for errors
- Try accessing `http://localhost:3001/health` (without HTTPS)

### Frontend Issues

**Problem**: Frontend shows certificate error
- Accept the certificate warning in browser
- Regenerate certificates if needed

**Problem**: Frontend can't connect to backend
- Verify `NEXT_PUBLIC_API_URL` is set to `https://192.168.0.138:3001`
- Check backend is running
- Verify firewall settings

### Mobile Streaming Issues

**Problem**: Mobile can't connect
- Verify mobile device is on same WiFi network
- Check mobile device can access `https://192.168.0.138:3000`
- Verify camera/microphone permissions are granted

**Problem**: Stream doesn't appear in dashboard
- Check backend logs for connection errors
- Verify WebRTC connection is established
- Check browser console for errors

### OBS Browser Source Issues

**Problem**: Browser Source shows black screen
- Open dashboard URL in regular browser first and accept certificate
- Verify streams are visible in regular browser
- Check OBS Browser Source log (Help → Log Files)

**Problem**: Certificate error in OBS
- Install certificate in system certificate store
- Or use a reverse proxy with valid SSL certificate

## Quick Test Checklist

- [ ] Backend starts without errors
- [ ] Backend health endpoint responds
- [ ] Frontend loads in browser
- [ ] Dashboard page accessible
- [ ] Mobile device can connect
- [ ] Mobile camera stream appears
- [ ] Stream visible in dashboard
- [ ] OBS Browser Source shows dashboard
- [ ] Streams appear in OBS

## Commands Reference

```bash
# Generate certificates
./generate-certs.sh 192.168.0.138

# Start all services
./start-all.sh

# Start individually
./start-backend.sh      # Terminal 1
./start-frontend.sh     # Terminal 2

# Test backend
curl -k https://192.168.0.138:3001/health

# Test frontend
# Open: https://192.168.0.138:3000
```

## URLs Summary

- **Frontend**: `https://192.168.0.138:3000`
- **Dashboard**: `https://192.168.0.138:3000/dashboard`
- **Stream Page**: `https://192.168.0.138:3000/stream`
- **Backend API**: `https://192.168.0.138:3001`
- **Backend Health**: `https://192.168.0.138:3001/health`

## Next Steps

After everything is working:
1. Test with multiple mobile devices
2. Configure OBS scenes with transitions
3. Set up recording if needed
4. Test streaming to platforms

---

**Your New IP**: 192.168.0.138  
**Status**: Ready to configure

