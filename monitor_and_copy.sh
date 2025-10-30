#!/bin/bash
while true; do
  # Check for files with size > 100KB
  FILE=$(docker exec mobilecamerareceptor-ndi-bridge-ubuntu-1 find /root -name 'MobileCam_Device*' -size +100k -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
  if [ ! -z "$FILE" ]; then
    echo "Found file: $FILE"
    docker cp mobilecamerareceptor-ndi-bridge-ubuntu-1:"$FILE" ~/MobileCam_Device_1000_5004_latest.ts
    echo "Copied to: ~/MobileCam_Device_1000_5004_latest.ts"
    ls -la ~/MobileCam_Device_1000_5004_latest.ts
    break
  fi
  sleep 2
done
