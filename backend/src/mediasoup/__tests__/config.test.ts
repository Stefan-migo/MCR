describe('mediasoupConfig — plainTransport section (R-009)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('should have default plainTransport listenIp and port range', () => {
    delete process.env.PLAIN_TRANSPORT_PORT_RANGE_START;
    delete process.env.PLAIN_TRANSPORT_PORT_RANGE_END;

    jest.isolateModules(() => {
      const { mediasoupConfig: cfg } = require('../config');
      expect(cfg.plainTransport).toBeDefined();
      expect(cfg.plainTransport.listenIp).toBe('127.0.0.1');
      expect(cfg.plainTransport.portRangeStart).toBe(20000);
      expect(cfg.plainTransport.portRangeEnd).toBe(21000);
    });
  });

  it('should use env var overrides for port range', () => {
    process.env.PLAIN_TRANSPORT_PORT_RANGE_START = '30000';
    process.env.PLAIN_TRANSPORT_PORT_RANGE_END = '30010';

    jest.isolateModules(() => {
      const { mediasoupConfig: cfg } = require('../config');
      expect(cfg.plainTransport.portRangeStart).toBe(30000);
      expect(cfg.plainTransport.portRangeEnd).toBe(30010);
    });
  });

  it('should have ndiBridge with 0.0.0.0 listenIp for Docker access', () => {
    delete process.env.PLAIN_TRANSPORT_PORT_RANGE_START;
    delete process.env.PLAIN_TRANSPORT_PORT_RANGE_END;

    jest.isolateModules(() => {
      const { mediasoupConfig: cfg } = require('../config');
      expect(cfg.ndiBridge).toBeDefined();
      expect(cfg.ndiBridge.enabled).toBe(false);
      expect(cfg.ndiBridge.streamDiscovery).toBe(true);
      // ndiBridge intentionally uses 0.0.0.0 so Docker bridge container can connect
      expect(cfg.ndiBridge.plainTransport.listenIp).toBe('0.0.0.0');
      expect(cfg.ndiBridge.plainTransport.portRangeStart).toBe(cfg.plainTransport.portRangeStart);
      expect(cfg.ndiBridge.plainTransport.portRangeEnd).toBe(cfg.plainTransport.portRangeEnd);
    });
  });
});

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
