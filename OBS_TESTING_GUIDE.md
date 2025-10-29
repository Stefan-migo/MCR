# OBS Studio NDI Testing Guide

## Current Status
- ✅ **HTTPS Setup**: Working
- ✅ **Mobile Cameras**: 1 active stream (1280x720 @ 30fps)
- ✅ **Backend**: Running with PlainTransports
- ❌ **NDI Bridge**: Not consuming streams ("Transport not found" errors)
- ❌ **NDI Sources**: Not appearing in OBS Studio

## Root Cause Analysis

The NDI Bridge is getting "Transport not found" errors when trying to consume streams from the backend. This indicates a mismatch between the transport IDs or timing issues.

## Solution 1: Fix NDI Bridge Connection (Recommended)

The issue is in the NDI Bridge's stream consumption logic. Let me create a fix:

### Step 1: Check Current Status
```bash
# Check if streams are active
curl -k -s https://192.168.100.19:3001/api/streams | jq .

# Check NDI Bridge status
curl -s http://localhost:8000/streams | jq .
```

### Step 2: Restart NDI Bridge with Debug
```bash
# Stop current NDI Bridge
pkill -f "python.*main.py"

# Start with debug logging
cd ndi-bridge
LOG_LEVEL=DEBUG python src/main.py
```

## Solution 2: Alternative Testing Methods

Since the NDI Bridge has connection issues, here are alternative ways to test:

### Method A: Direct RTP to NDI (Bypass NDI Bridge)

1. **Use FFmpeg with RTP input**:
   ```bash
   # Get RTP transport info from backend
   curl -k -s https://192.168.100.19:3001/api/plain-transports | jq .
   
   # Use FFmpeg to receive RTP and send to NDI
   ffmpeg -i rtp://192.168.100.19:10009 -f libndi_newtek "MobileCam_Direct"
   ```

### Method B: Test with OBS Studio Screen Capture

1. **Open OBS Studio**
2. **Add Display Capture**:
   - Click "+" in Sources
   - Select "Display Capture"
   - Choose your screen
3. **Add Window Capture**:
   - Click "+" in Sources
   - Select "Window Capture"
   - Choose the mobile camera browser window

### Method C: Use OBS Studio Virtual Camera

1. **In OBS Studio**:
   - Add "Display Capture" or "Window Capture"
   - Start Virtual Camera (Tools → Start Virtual Camera)
2. **In mobile camera app**:
   - Use OBS Virtual Camera as input source

## Solution 3: Fix the NDI Bridge (Technical)

The core issue is in the NDI Bridge's stream consumption. Here's what needs to be fixed:

### Problem
- NDI Bridge requests `ndi-bridge-consume-stream`
- Backend creates PlainTransport
- NDI Bridge gets "Transport not found" error
- Streams are not consumed

### Fix
The NDI Bridge needs to:
1. Wait for PlainTransport creation
2. Use correct transport ID
3. Handle RTP reception properly

## Immediate Testing Steps

### Step 1: Test OBS Studio NDI Plugin
1. **Open OBS Studio**
2. **Add NDI Source**
3. **Check if ANY NDI sources appear** (even from other applications)

### Step 2: If No NDI Sources Appear
1. **Install NDI Plugin**: https://github.com/Palakis/obs-ndi
2. **Restart OBS Studio**
3. **Check Windows Firewall** settings

### Step 3: Test with Screen Capture
1. **Add Display Capture** in OBS Studio
2. **Capture the mobile camera browser window**
3. **This proves the mobile camera is working**

## Expected Results

### If NDI Bridge Works:
- NDI sources appear in OBS Studio: `MobileCam_Device_*`
- Mobile camera feed shows in OBS Studio
- Ready for professional video production

### If NDI Bridge Doesn't Work:
- Use Display Capture as workaround
- Mobile camera still works for testing
- NDI Bridge needs debugging/fixing

## Next Steps

1. **Test OBS Studio** with the methods above
2. **Report results** - do any NDI sources appear?
3. **If no NDI sources**, we'll fix the NDI Bridge connection
4. **If NDI sources appear**, the system is working!

## Troubleshooting Commands

```bash
# Check backend streams
curl -k -s https://192.168.100.19:3001/api/streams | jq .

# Check NDI Bridge
curl -s http://localhost:8000/health | jq .

# Check PlainTransports
curl -k -s https://192.168.100.19:3001/api/plain-transports | jq .

# Restart NDI Bridge
pkill -f "python.*main.py" && cd ndi-bridge && python src/main.py
```

## Success Criteria

- ✅ Mobile camera streams in browser
- ✅ OBS Studio can capture mobile camera (via Display Capture)
- ✅ NDI sources appear in OBS Studio (if NDI Bridge works)
- ✅ Professional video production ready
