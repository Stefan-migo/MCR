/**
 * @jest-environment node
 */

describe('getDefaultBackendHost', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BACKEND_HOST;
    // Ensure SSR mode: no window object
    delete (global as any).window;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('should return localhost as SSR fallback when no env var is set', () => {
    const { getDefaultBackendHost } = require('../url');
    expect(getDefaultBackendHost()).toBe('localhost');
  });

  it('should return NEXT_PUBLIC_BACKEND_HOST when set (SSR)', () => {
    process.env.NEXT_PUBLIC_BACKEND_HOST = 'custom.lan';
    const { getDefaultBackendHost } = require('../url');
    expect(getDefaultBackendHost()).toBe('custom.lan');
  });
});
