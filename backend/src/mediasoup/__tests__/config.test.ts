describe('mediasoupConfig announcedIp', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('should use getAnnouncedIp value as IPv4 announcedIp (no env vars -> auto-detect)', () => {
    // Clear env vars that override auto-detection
    delete process.env.MEDIASOUP_ANNOUNCED_IP;
    delete process.env.ANNOUNCED_IP;
    delete process.env.PUBLIC_IP;
    delete process.env.ANNOUNCED_IP_V4;

    // Use isolateModules to get a fresh import that picks up the env
    jest.isolateModules(() => {
      // Mock os.networkInterfaces to return a known IP
      jest.doMock('os', () => ({
        networkInterfaces: jest.fn(() => ({
          eth0: [
            { family: 'IPv4', address: '10.0.0.42', netmask: '255.0.0.0', mac: '00:00:00:00:00:01', internal: false, cidr: '10.0.0.42/8' },
          ],
        })),
      }));

      const { mediasoupConfig: cfg } = require('../config');
      expect(cfg.webRtcTransport.listenIps[0].announcedIp).toBe('10.0.0.42');
    });
  });

  it('should use env var MEDIASOUP_ANNOUNCED_IP when set', () => {
    process.env.MEDIASOUP_ANNOUNCED_IP = '10.0.0.5';

    jest.isolateModules(() => {
      jest.doMock('os', () => ({
        networkInterfaces: jest.fn(() => ({
          eth0: [
            { family: 'IPv4', address: '192.168.1.50', netmask: '255.255.0.0', mac: '00:00:00:00:00:01', internal: false, cidr: '192.168.1.50/16' },
          ],
        })),
      }));

      const { mediasoupConfig: cfg } = require('../config');
      // MEDIASOUP_ANNOUNCED_IP takes precedence over auto-detection
      expect(cfg.webRtcTransport.listenIps[0].announcedIp).toBe('10.0.0.5');
    });
  });
});
