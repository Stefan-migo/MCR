#!/bin/bash

echo "🎬 Creating FFmpeg NDI source..."

# Create a test pattern NDI source using FFmpeg
ffmpeg \
    -f lavfi \
    -i "testsrc2=size=1280x720:rate=30:duration=0" \
    -f lavfi \
    -i "sine=frequency=1000:duration=0" \
    -c:v libx264 \
    -preset ultrafast \
    -tune zerolatency \
    -c:a aac \
    -f libndi_newtek \
    -pix_fmt yuv420p \
    "MobileCam_FFmpegTest" &

FFMPEG_PID=$!

echo "✅ FFmpeg NDI source created: MobileCam_FFmpegTest"
echo "   PID: $FFMPEG_PID"
echo ""
echo "🎯 NOW CHECK OBS STUDIO:"
echo "1. Open OBS Studio"
echo "2. Add NDI Source"
echo "3. Look for 'MobileCam_FFmpegTest'"
echo "4. If it appears, the NDI system is working!"
echo ""
echo "Press Ctrl+C to stop the NDI source"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Stopping FFmpeg NDI source..."
    kill $FFMPEG_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for FFmpeg process
wait $FFMPEG_PID
