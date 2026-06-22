#!/bin/bash
# Run NDI bridge with Python 3.12 (aiortc-compatible version)
cd "$(dirname "$0")"
source venv312/Scripts/activate
export NDI_BACKEND_URL=http://138.128.243.241:3001
export NDI_SSL_VERIFY=false
export NDI_SOURCE_PREFIX=MCR-
python -m src.bridge
