#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export NODE_ENV=development
npm run dev
