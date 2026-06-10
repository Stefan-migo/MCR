# Quick Start Guide - IP: 192.168.0.138

## Step 1: Generate SSL Certificates

**In Git Bash:**
```bash
./generate-certs.sh 192.168.0.138
```

This will:
- Generate `cert.pem` and `key.pem` in root directory
- Copy certificates to `backend/` and `frontend/` directories

## Step 2: Start Services

### Option A: Start All Together (Recommended)
```bash
./start-all.sh
```

This starts both backend and frontend automatically.

### Option B: Start Separately

**Terminal 1 - Backend:**
```bash
./start-backend.sh
```

**Terminal 2 - Frontend:**
```bash
./start-frontend.sh
```

## Step 3: Test Backend

Open browser: `https://192.168.0.138:3001/health`

Should see: `{"status":"ok"}`

## Step 4: Test Frontend

Open browser: `https://192.168.0.138:3000`

- Accept security warning
- Landing page should load
- Click "Dashboard" to see stream management

## Step 5: Test Mobile Streaming

1. On mobile device (same WiFi):
   - Open: `https://192.168.0.138:3000`
   - Accept security warning
   - Click "Mobile Stream"
   - Allow camera permission
   - Click "Connect"

2. On desktop:
   - Open: `https://192.168.0.138:3000/dashboard`
   - Your mobile stream should appear!

## Step 6: Setup OBS Browser Source

1. Open OBS Studio
2. Add → Browser Source
3. URL: `https://192.168.0.138:3000/dashboard`
4. Width: 1920, Height: 1080
5. Click OK

**Note:** First open the URL in Chrome/Edge to accept the certificate, then OBS will trust it.

## Your URLs

- **Frontend**: `https://192.168.0.138:3000`
- **Dashboard**: `https://192.168.0.138:3000/dashboard`
- **Backend API**: `https://192.168.0.138:3001`
- **Health Check**: `https://192.168.0.138:3001/health`

## Troubleshooting

**Backend won't start?**
- Check port 3001 is free: `netstat -ano | findstr :3001`
- Regenerate certificates: `./generate-certs.sh 192.168.0.138`

**Frontend won't start?**
- Check port 3000 is free: `netstat -ano | findstr :3000`
- Verify certificates exist: `ls frontend/cert.pem frontend/key.pem`

**Mobile can't connect?**
- Verify same WiFi network
- Try accessing `https://192.168.0.138:3000` on mobile browser first
- Check Windows Firewall allows connections

**OBS shows black screen?**
- Open dashboard URL in Chrome/Edge first
- Accept certificate warning
- Refresh Browser Source in OBS

## Full Documentation

- **Complete Testing Guide**: See `TESTING_GUIDE.md`
- **OBS Setup**: See `Docs/OBS_BROWSER_SOURCE_SETUP.md`
- **IP Setup**: See `SETUP_NEW_IP.md`

---

**Ready to start?** Run `./start-all.sh` and open `https://192.168.0.138:3000` 🚀

