# OBS Browser Source Setup Guide

This guide explains how to use OBS Studio's Browser Source to capture mobile camera streams from the Mobile Camera Receptor dashboard.

## Overview

Instead of using NDI, we now use OBS Studio's built-in Browser Source plugin to capture the dashboard directly. This simplifies the setup and eliminates the need for NDI SDK installation.

## Prerequisites

- OBS Studio installed (version 28 or later)
- Mobile Camera Receptor running (backend and frontend)
- Dashboard accessible via HTTPS

## Step-by-Step Setup

### Step 1: Start Your Services

Ensure both backend and frontend are running:

```bash
# Start all services
./start-all.sh

# Or start individually
./start-backend.sh
./start-frontend.sh
```

Verify the dashboard is accessible:
- Open browser: `https://192.168.100.19:3000/dashboard`
- You should see the stream management interface

### Step 2: Open OBS Studio

1. Launch OBS Studio
2. Create a new scene or select an existing scene

### Step 3: Add Browser Source

1. In the Sources panel, click the **"+"** button
2. Select **"Browser Source"**
3. Name it (e.g., "Mobile Camera Streams")
4. Click **"OK"**

### Step 4: Configure Browser Source

In the Browser Source properties window:

#### Basic Settings

- **URL**: Enter your dashboard URL
  ```
  https://192.168.100.19:3000/dashboard
  ```
  Replace `192.168.100.19` with your actual server IP address.

- **Width**: `1920` (or your preferred width)
- **Height**: `1080` (or your preferred height)

#### Advanced Settings

- **Shutdown source when not visible**: ✅ Checked (optional, saves resources)
- **Refresh browser when scene becomes active**: ✅ Checked (recommended)
- **Control audio via OBS**: ✅ Checked (if you have audio)

#### Custom CSS (Optional)

You can hide UI elements that you don't want in OBS:

```css
/* Hide navigation or other UI elements */
.nav, .header, .footer {
  display: none !important;
}
```

### Step 5: Configure for HTTPS (Self-Signed Certificate)

If you're using self-signed certificates (development):

1. First, open the dashboard URL in your regular browser
2. Accept the security warning and proceed to the site
3. This tells OBS Browser Source to trust the certificate

Alternatively, you can:
- Use a reverse proxy with valid SSL certificates
- Install the self-signed certificate in your system's certificate store

### Step 6: Test the Setup

1. Start streaming from a mobile device
2. Open the dashboard URL in a regular browser to verify streams appear
3. In OBS, the Browser Source should show the same streams
4. You can now use OBS features like:
   - Scene transitions
   - Filters and effects
   - Recording
   - Streaming to platforms

## Troubleshooting

### Issue: Browser Source shows blank/black screen

**Solutions:**
1. Check that the dashboard URL is correct and accessible in a regular browser
2. Verify HTTPS certificate is accepted (open URL in browser first)
3. Check OBS Browser Source log:
   - Help → Log Files → View Current Log
   - Look for browser-related errors

### Issue: Browser Source shows "SSL Error" or "Certificate Error"

**Solutions:**
1. Open the dashboard URL in Chrome/Edge first and accept the certificate
2. Use a valid SSL certificate (Let's Encrypt, etc.)
3. For development, you may need to install the self-signed certificate

### Issue: Streams don't appear in Browser Source

**Solutions:**
1. Verify streams are visible in regular browser
2. Check browser console for errors (F12 in regular browser)
3. Ensure WebRTC connections are working (check backend logs)
4. Try refreshing the Browser Source (right-click → Refresh)

### Issue: Low frame rate or stuttering

**Solutions:**
1. Reduce Browser Source resolution (e.g., 1280x720 instead of 1920x1080)
2. Disable "Shutdown source when not visible" if you need constant updates
3. Check network connection between OBS machine and server
4. Reduce number of simultaneous streams if CPU is overloaded

### Issue: Browser Source uses too much CPU

**Solutions:**
1. Enable "Shutdown source when not visible"
2. Reduce Browser Source resolution
3. Use hardware acceleration if available (OBS Settings → Advanced → Hardware Encoder)

## Advanced Configuration

### Multiple Browser Sources

You can create separate Browser Sources for different views:

1. **Dashboard View**: Full dashboard with all streams
   - URL: `https://192.168.100.19:3000/dashboard`
   - Good for: Overview of all streams

2. **Individual Stream View**: Direct stream page
   - URL: `https://192.168.100.19:3000/viewer/[producerId]`
   - Good for: Single stream focus

### Custom CSS Styling

You can use Custom CSS in Browser Source to:
- Hide UI elements
- Change layout
- Add overlays
- Adjust colors

Example CSS to hide navigation:

```css
nav, .navbar, .header {
  display: none !important;
}

/* Make streams fill the entire viewport */
body {
  margin: 0;
  padding: 0;
}
```

### Performance Optimization

For better performance:

1. **Lower Resolution**: Use 1280x720 instead of 1920x1080
2. **Disable Unnecessary Features**: Turn off animations, transitions
3. **Use Hardware Acceleration**: Enable in OBS settings
4. **Limit Streams**: Show only active streams in dashboard

## Comparison: Browser Source vs NDI

| Feature | Browser Source | NDI |
|---------|---------------|-----|
| **Setup Complexity** | ✅ Simple (built-in) | ❌ Complex (SDK required) |
| **Installation** | ✅ No additional software | ❌ NDI SDK + plugins |
| **CPU Usage** | ⚠️ Moderate (browser rendering) | ✅ Low (direct video) |
| **Latency** | ⚠️ Slightly higher | ✅ Lower |
| **Quality** | ✅ Excellent | ✅ Excellent |
| **Flexibility** | ✅ Can style with CSS | ❌ Limited |
| **Cross-Platform** | ✅ Works everywhere | ⚠️ Platform-specific |

## Best Practices

1. **Always test in regular browser first** before using in OBS
2. **Use HTTPS** for security (especially for mobile camera access)
3. **Keep dashboard URL updated** if your server IP changes
4. **Monitor CPU usage** and adjust resolution if needed
5. **Use scene transitions** in OBS for professional presentations
6. **Record streams** using OBS recording feature for later use

## Alternative: Window Capture (Fallback)

If Browser Source doesn't work, you can use Window Capture:

1. Open dashboard in a regular browser window
2. In OBS, add "Window Capture" source
3. Select the browser window
4. This captures the browser window directly

**Note**: Window Capture has higher CPU usage and may capture browser UI elements.

## Next Steps

After setting up Browser Source:

1. ✅ Test with one mobile device stream
2. ✅ Test with multiple simultaneous streams
3. ✅ Configure OBS scenes and transitions
4. ✅ Set up recording if needed
5. ✅ Test streaming to platforms (Twitch, YouTube, etc.)

## Support

If you encounter issues:

1. Check OBS log files (Help → Log Files)
2. Check browser console (open dashboard in regular browser, press F12)
3. Verify backend and frontend logs
4. Ensure all services are running correctly

---

**Last Updated**: After NDI removal  
**OBS Version**: Tested with OBS Studio 28+  
**Status**: ✅ Production Ready

