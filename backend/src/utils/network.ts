import os from 'os';

let cachedIp: string | null = null;

// Virtual/docker interface name patterns to exclude
const VIRTUAL_PATTERNS = [
  'docker',
  'vEthernet',
  'Hyper-V',
  'VirtualBox',
  'VMware',
  'vnic',
  'vmnet',
  'Loopback',
];

function isVirtualInterface(name: string): boolean {
  const lower = name.toLowerCase();
  return VIRTUAL_PATTERNS.some(pattern => lower.includes(pattern.toLowerCase()));
}

/**
 * Score a private IP range. Higher is better.
 *   192.168.x.x  → 3 (preferred)
 *   10.x.x.x     → 2
 *   172.16-31.x.x → 1
 *   other        → 0
 */
function scoreIp(address: string): number {
  if (address.startsWith('192.168.')) return 3;
  if (address.startsWith('10.')) return 2;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(address)) return 1;
  return 0;
}

/**
 * Detects the best LAN IPv4 address by scanning available network interfaces.
 * Runs once — result is cached at module level.
 * Never throws. Returns '127.0.0.1' as fallback.
 */
export function detectLanIp(): string {
  if (cachedIp !== null) return cachedIp;

  const interfaces = os.networkInterfaces();
  let bestIp = '127.0.0.1';
  let bestScore = -1;

  for (const [name, entries] of Object.entries(interfaces)) {
    if (isVirtualInterface(name)) continue;
    if (!entries) continue;

    for (const entry of entries) {
      if (entry.family !== 'IPv4') continue;
      if (entry.internal) continue;

      const score = scoreIp(entry.address);
      if (score > bestScore) {
        bestScore = score;
        bestIp = entry.address;
      }
    }
  }

  cachedIp = bestIp;
  return bestIp;
}

/**
 * Returns the announced IP with env var precedence:
 *   MEDIASOUP_ANNOUNCED_IP > ANNOUNCED_IP > PUBLIC_IP > detectLanIp()
 * Never throws.
 */
export function getAnnouncedIp(): string {
  const envVar =
    process.env.MEDIASOUP_ANNOUNCED_IP ||
    process.env.ANNOUNCED_IP ||
    process.env.PUBLIC_IP;

  if (envVar) return envVar;

  return detectLanIp();
}

/** @internal Exported for testing only — resets the module-level cache. */
export function _resetCache(): void {
  cachedIp = null;
}
