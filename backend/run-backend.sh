#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export NODE_ENV=development
export MEDIASOUP_ANNOUNCED_IP=192.168.0.138
npm run dev
