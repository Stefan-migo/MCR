"""Scan for NDI sources on the local network using NDIlib."""
import NDIlib as ndi

if not ndi.initialize():
    print("Failed to initialize NDI")
    exit(1)

print("Scanning for NDI sources... (Ctrl+C to stop)")
print("---")

# Create a finder instance
finder = ndi.find_create_v2()
if not finder:
    print("Failed to create NDI finder")
    ndi.destroy()
    exit(1)

import time
seen = set()

try:
    while True:
        ndi.find_wait_for_sources(finder, 1000)  # 1 sec timeout
        sources = ndi.find_get_current_sources(finder)
        for src in sources:
            if src.ndi_name not in seen:
                print(f"  ▶ {src.ndi_name}")
            if hasattr(src, 'url_address') and src.url_address:
                print(f"    URL: {src.url_address}")
                seen.add(src.ndi_name)
        if not sources:
            print("  (no sources found yet)")
        time.sleep(1)
except KeyboardInterrupt:
    print("\n---")
    print("Done. Total sources found:", len(seen))
finally:
    ndi.find_destroy(finder)
    ndi.destroy()
