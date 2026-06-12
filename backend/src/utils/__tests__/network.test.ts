import { detectLanIp, getAnnouncedIp, _resetCache } from '../network';

describe('detectLanIp', () => {
  let originalNetworkInterfaces: typeof import('os')['networkInterfaces'];

  beforeAll(() => {
    // Save original
    const os = require('os');
    originalNetworkInterfaces = os.networkInterfaces;
  });

  afterAll(() => {
    // Restore original
    const os = require('os');
    os.networkInterfaces = originalNetworkInterfaces;
  });

  beforeEach(() => {
    _resetCache();
  });

  afterEach(() => {
    const os = require('os');
    os.networkInterfaces = originalNetworkInterfaces;
    delete process.env.MEDIASOUP_ANNOUNCED_IP;
    delete process.env.ANNOUNCED_IP;
    delete process.env.PUBLIC_IP;
  });

  function mockInterfaces(interfaces: Record<string, import('os').NetworkInterfaceInfo[]>) {
    const os = require('os');
    os.networkInterfaces = jest.fn(() => interfaces);
  }

  it('should return 127.0.0.1 when no network interfaces exist', () => {
    mockInterfaces({});
    expect(detectLanIp()).toBe('127.0.0.1');
  });

  it('should return 127.0.0.1 when only loopback interfaces exist', () => {
    mockInterfaces({
      lo: [
        { family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
      ],
    });
    expect(detectLanIp()).toBe('127.0.0.1');
  });

  it('should prefer 192.168.x.x over 10.x.x.x', () => {
    mockInterfaces({
      eth0: [
        { family: 'IPv4', address: '10.0.0.5', netmask: '255.0.0.0', mac: '00:00:00:00:00:01', internal: false, cidr: '10.0.0.5/8' },
      ],
      eth1: [
        { family: 'IPv4', address: '192.168.1.50', netmask: '255.255.0.0', mac: '00:00:00:00:00:02', internal: false, cidr: '192.168.1.50/16' },
      ],
    });
    expect(detectLanIp()).toBe('192.168.1.50');
  });

  it('should prefer 10.x.x.x over 172.16.x.x', () => {
    mockInterfaces({
      eth0: [
        { family: 'IPv4', address: '10.0.0.5', netmask: '255.0.0.0', mac: '00:00:00:00:00:01', internal: false, cidr: '10.0.0.5/8' },
      ],
      eth1: [
        { family: 'IPv4', address: '172.16.0.5', netmask: '255.240.0.0', mac: '00:00:00:00:00:02', internal: false, cidr: '172.16.0.5/12' },
      ],
    });
    expect(detectLanIp()).toBe('10.0.0.5');
  });

  it('should exclude Docker bridge interfaces', () => {
    mockInterfaces({
      'docker0': [
        { family: 'IPv4', address: '172.17.0.1', netmask: '255.255.0.0', mac: '00:00:00:00:00:01', internal: false, cidr: '172.17.0.1/16' },
      ],
      'eth0': [
        { family: 'IPv4', address: '192.168.1.50', netmask: '255.255.0.0', mac: '00:00:00:00:00:02', internal: false, cidr: '192.168.1.50/16' },
      ],
    });
    expect(detectLanIp()).toBe('192.168.1.50');
  });

  it('should exclude virtual interface names (vEthernet, Hyper-V, VirtualBox, VMware, vnic, vmnet, Loopback)', () => {
    mockInterfaces({
      'vEthernet (Default Switch)': [
        { family: 'IPv4', address: '172.20.0.1', netmask: '255.255.0.0', mac: '00:00:00:00:00:01', internal: false, cidr: '172.20.0.1/16' },
      ],
      'eth0': [
        { family: 'IPv4', address: '192.168.1.100', netmask: '255.255.0.0', mac: '00:00:00:00:00:02', internal: false, cidr: '192.168.1.100/16' },
      ],
    });
    expect(detectLanIp()).toBe('192.168.1.100');
  });

  it('should ignore IPv6 interfaces', () => {
    mockInterfaces({
      eth0: [
        { family: 'IPv6', address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', mac: '00:00:00:00:00:01', internal: false, cidr: 'fe80::1/64', scopeid: 2 },
      ],
    });
    expect(detectLanIp()).toBe('127.0.0.1');
  });

  it('should cache the result and not call os.networkInterfaces() again', () => {
    const os = require('os');
    const mockFn = jest.fn(() => ({
      eth0: [
        { family: 'IPv4', address: '192.168.1.50', netmask: '255.255.0.0', mac: '00:00:00:00:00:01', internal: false, cidr: '192.168.1.50/16' },
      ],
    }));
    os.networkInterfaces = mockFn;

    // First call
    const first = detectLanIp();
    expect(first).toBe('192.168.1.50');

    // Second call should use cache
    const second = detectLanIp();
    expect(second).toBe('192.168.1.50');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});

describe('getAnnouncedIp', () => {
  beforeEach(() => {
    _resetCache();
    delete process.env.MEDIASOUP_ANNOUNCED_IP;
    delete process.env.ANNOUNCED_IP;
    delete process.env.PUBLIC_IP;
  });

  it('should use MEDIASOUP_ANNOUNCED_IP when set', () => {
    process.env.MEDIASOUP_ANNOUNCED_IP = '10.0.0.5';
    expect(getAnnouncedIp()).toBe('10.0.0.5');
  });

  it('should use ANNOUNCED_IP when MEDIASOUP_ANNOUNCED_IP is not set', () => {
    process.env.ANNOUNCED_IP = '10.0.0.10';
    expect(getAnnouncedIp()).toBe('10.0.0.10');
  });

  it('should use PUBLIC_IP when neither MEDIASOUP_ANNOUNCED_IP nor ANNOUNCED_IP are set', () => {
    process.env.PUBLIC_IP = '10.0.0.20';
    expect(getAnnouncedIp()).toBe('10.0.0.20');
  });

  it('should prefer MEDIASOUP_ANNOUNCED_IP over ANNOUNCED_IP', () => {
    process.env.MEDIASOUP_ANNOUNCED_IP = '10.0.0.5';
    process.env.ANNOUNCED_IP = '10.0.0.10';
    expect(getAnnouncedIp()).toBe('10.0.0.5');
  });

  it('should prefer ANNOUNCED_IP over PUBLIC_IP', () => {
    process.env.ANNOUNCED_IP = '10.0.0.10';
    process.env.PUBLIC_IP = '10.0.0.20';
    expect(getAnnouncedIp()).toBe('10.0.0.10');
  });

  it('should auto-detect when no env vars are set', () => {
    const os = require('os');
    os.networkInterfaces = jest.fn(() => ({
      eth0: [
        { family: 'IPv4', address: '192.168.1.50', netmask: '255.255.0.0', mac: '00:00:00:00:00:01', internal: false, cidr: '192.168.1.50/16' },
      ],
    }));

    expect(getAnnouncedIp()).toBe('192.168.1.50');
  });

  it('should fall back to 127.0.0.1 when no env vars and no LAN interfaces', () => {
    const os = require('os');
    os.networkInterfaces = jest.fn(() => ({}));

    expect(getAnnouncedIp()).toBe('127.0.0.1');
  });
});
