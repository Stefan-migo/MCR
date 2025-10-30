export function getDefaultBackendHost(): string {
  if (typeof window !== 'undefined') return window.location.hostname;
  return process.env.NEXT_PUBLIC_BACKEND_HOST || '192.168.100.11';
}

export function getBackendHttpBase(): string {
  const host = getDefaultBackendHost();
  return `https://${host}:3001`;
}

export function getBackendWsUrl(): string {
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env;
  const host = getDefaultBackendHost();
  const isHttps = typeof window !== 'undefined' ? window.location.protocol === 'https:' : true;
  const scheme = isHttps ? 'wss' : 'ws';
  return `${scheme}://${host}:3001`;
}


