#!/bin/bash

echo "========================================"
echo "Starting Mobile Camera Receptor Servers"
echo "========================================"

echo ""
echo "Starting Backend Server..."
cmd.exe /c "start \"Backend\" cmd /k \"cd /d %~dp0backend && npm run dev\""

echo ""
echo "Starting Frontend Server (HTTPS)..."
cmd.exe /c "start \"Frontend\" cmd /k \"cd /d %~dp0frontend && npm run dev:https\""

echo ""
echo "Starting NDI Bridge..."
cmd.exe /c "start \"NDI Bridge\" cmd /k \"cd /d %~dp0ndi-bridge && python src/main.py\""

echo ""
echo "========================================"
echo "All servers starting..."
echo "========================================"
echo ""
echo "Backend:  https://localhost:3001"
echo "Frontend: https://localhost:3000"
echo "NDI Bridge: http://localhost:8000"
echo ""
echo "Mobile Access:"
echo "Frontend: https://192.168.100.11:3000"
echo ""
echo "Check the terminal windows for any errors"
echo "Press any key to exit this window..."
read -n 1
