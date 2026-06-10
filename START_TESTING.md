# Ready to Test! 🚀

All configuration files have been updated for your new LAN IP: **192.168.0.138**

## Quick Start (3 Steps)

### 1. Generate SSL Certificates
```bash
# In Git Bash
./generate-certs.sh 192.168.0.138
```

### 2. Start Services
```bash
# Start both backend and frontend
./start-all.sh
```

### 3. Open Dashboard
- Open browser: `https://192.168.0.138:3000`
- Accept security warning
- Click "Dashboard"

## What Was Updated

✅ All configuration files updated with new IP: **192.168.0.138**
- `start-all.sh`
- `start-backend.sh`
- `start-frontend.sh`
- `start_servers.sh` and `start_servers.bat`
- `setup-local-dev.sh`
- `docker-compose.yml`
- `generate-certs.sh`
- `frontend/src/lib/url.ts`
- `frontend/src/lib/camera-service.ts`
- `backend/run-backend.sh`

## Testing Steps

### Test 1: Backend (30 seconds)
```bash
# Start backend
./start-backend.sh

# In another terminal or browser, test:
curl -k https://192.168.0.138:3001/health
# Should return: {"status":"ok"}
```

### Test 2: Frontend (30 seconds)
```bash
# Start frontend
./start-frontend.sh

# Open browser:
https://192.168.0.138:3000
# Should see landing page
```

### Test 3: Mobile Streaming (2 minutes)
1. On mobile: `https://192.168.0.138:3000`
2. Click "Mobile Stream"
3. Allow camera permission
4. Click "Connect"
5. Check desktop dashboard - stream should appear!

### Test 4: OBS Browser Source (2 minutes)
1. Open OBS Studio
2. Add → Browser Source
3. URL: `https://192.168.0.138:3000/dashboard`
4. Width: 1920, Height: 1080
5. Click OK
6. Streams should appear!

## Full Guides

- **Complete Testing Guide**: `TESTING_GUIDE.md` (detailed step-by-step)
- **Quick Start**: `QUICK_START.md` (fast reference)
- **OBS Setup**: `Docs/OBS_BROWSER_SOURCE_SETUP.md` (OBS-specific)

## Your URLs

- **Frontend**: `https://192.168.0.138:3000`
- **Dashboard**: `https://192.168.0.138:3000/dashboard`
- **Backend**: `https://192.168.0.138:3001`
- **Health**: `https://192.168.0.138:3001/health`

## Need Help?

1. Check `TESTING_GUIDE.md` for detailed troubleshooting
2. Verify certificates exist: `ls cert.pem key.pem`
3. Check ports are free: `netstat -ano | findstr :3000`
4. Check backend logs for errors

---

**Ready?** Run `./start-all.sh` and open `https://192.168.0.138:3000` 🎉

