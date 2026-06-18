/**
 * @jest-environment node
 */

import { determineLensType, CameraService } from '../camera-service';

// ── Mock browser globals ──────────────────────────────────────────────

function setupBrowserMocks() {
  const track = {
    getCapabilities: jest.fn().mockReturnValue({}),
    getSettings: jest.fn().mockReturnValue({}),
    applyConstraints: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
  };

  const stream = {
    getTracks: jest.fn().mockReturnValue([track]),
    getVideoTracks: jest.fn().mockReturnValue([track]),
    active: true,
  };

  (global as any).navigator = {
    mediaDevices: {
      getUserMedia: jest.fn().mockResolvedValue(stream),
      enumerateDevices: jest.fn().mockResolvedValue([]),
    },
    permissions: {
      query: jest.fn().mockResolvedValue({ state: 'granted', addEventListener: jest.fn() }),
    },
  };

  return { track, stream };
}

// ── Pure function: determineLensType ──────────────────────────────────

describe('determineLensType', () => {
  it('returns "front" for labels containing "Front" or "user"', () => {
    expect(determineLensType('Front Camera', 'user')).toBe('front');
    expect(determineLensType('User Facing', undefined)).toBe('front');
  });

  it('returns "ultra-wide" for labels containing "Ultra", "0.5x", or "0.6x"', () => {
    expect(determineLensType('Ultra Wide Camera', 'environment')).toBe('ultra-wide');
    expect(determineLensType('0.5x Camera', 'environment')).toBe('ultra-wide');
    expect(determineLensType('0.6x Wide Angle', 'environment')).toBe('ultra-wide');
  });

  it('returns "telephoto" for labels containing "Tele", "2x", "3x", or "Zoom"', () => {
    expect(determineLensType('Telephoto Camera', 'environment')).toBe('telephoto');
    expect(determineLensType('3x Zoom', 'environment')).toBe('telephoto');
  });

  it('returns "front" when facingMode is "user" and no label pattern matches', () => {
    expect(determineLensType('Unknown Camera', 'user')).toBe('front');
  });

  it('returns "wide" for unrecognized environment cameras', () => {
    expect(determineLensType('Back Camera', 'environment')).toBe('wide');
    expect(determineLensType('Main Camera', undefined)).toBe('wide');
  });
});

// ── CameraService.enumerateLenses ────────────────────────────────────

describe('CameraService.enumerateLenses', () => {
  beforeEach(() => {
    setupBrowserMocks();
  });

  it('calls enumerateDevices after getUserMedia permission trigger', async () => {
    const { stream } = setupBrowserMocks();
    (global.navigator as any).mediaDevices.enumerateDevices = jest.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Back Camera', groupId: 'g1' },
    ]);
    (global.navigator as any).mediaDevices.getUserMedia = jest.fn().mockResolvedValue(stream);

    const service = new CameraService();
    const lenses = await service.enumerateLenses();

    expect((global.navigator as any).mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true });
    expect((global.navigator as any).mediaDevices.enumerateDevices).toHaveBeenCalled();
    expect(lenses).toHaveLength(1);
  });

  it('stops the permission stream tracks immediately after getUserMedia', async () => {
    const mocks = setupBrowserMocks();
    (global.navigator as any).mediaDevices.enumerateDevices = jest.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Back Camera', groupId: 'g1' },
    ]);

    const service = new CameraService();
    await service.enumerateLenses();

    expect(mocks.track.stop).toHaveBeenCalled();
  });

  it('maps each videoinput device to a LensInfo with correct lensType', async () => {
    setupBrowserMocks();
    (global.navigator as any).mediaDevices.enumerateDevices = jest.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-u', label: '0.5x Ultra Wide', groupId: 'g1' },
      { kind: 'videoinput', deviceId: 'cam-w', label: 'Back Camera', groupId: 'g1' },
      { kind: 'videoinput', deviceId: 'cam-t', label: 'Telephoto 3x', groupId: 'g1' },
      { kind: 'videoinput', deviceId: 'cam-f', label: 'Front Camera', groupId: 'g2' },
    ]);

    const service = new CameraService();
    const lenses = await service.enumerateLenses();

    expect(lenses[0].lensType).toBe('ultra-wide');
    expect(lenses[1].lensType).toBe('wide');
    expect(lenses[2].lensType).toBe('telephoto');
    expect(lenses[3].lensType).toBe('front');
  });

  it('includes groupId from enumerated device', async () => {
    setupBrowserMocks();
    (global.navigator as any).mediaDevices.enumerateDevices = jest.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Back Camera', groupId: 'g1' },
      { kind: 'videoinput', deviceId: 'cam-2', label: 'Front Camera', groupId: 'g2' },
    ]);

    const service = new CameraService();
    const lenses = await service.enumerateLenses();

    expect(lenses[0].groupId).toBe('g1');
    expect(lenses[1].groupId).toBe('g2');
  });

  it('returns zoom null when no active stream is available', async () => {
    setupBrowserMocks();
    (global.navigator as any).mediaDevices.enumerateDevices = jest.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Back Camera', groupId: 'g1' },
    ]);

    const service = new CameraService();
    const lenses = await service.enumerateLenses();

    expect(lenses[0].zoomMin).toBeNull();
    expect(lenses[0].zoomMax).toBeNull();
    expect(lenses[0].zoomStep).toBeNull();
  });

  it('populates zoom from active stream track capabilities', async () => {
    setupBrowserMocks();
    (global.navigator as any).mediaDevices.enumerateDevices = jest.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Back Camera', groupId: 'g1' },
    ]);

    const track = {
      getCapabilities: jest.fn().mockReturnValue({ zoom: { min: 1, max: 6, step: 0.1 } }),
      getSettings: jest.fn().mockReturnValue({ deviceId: 'cam-1' }),
      stop: jest.fn(),
    };
    const stream = { getTracks: jest.fn().mockReturnValue([track]), getVideoTracks: jest.fn().mockReturnValue([track]), active: true };

    const service = new CameraService();
    (service as any).currentStream = stream;

    const lenses = await service.enumerateLenses();

    const activeLens = lenses.find(l => l.deviceId === 'cam-1');
    expect(activeLens?.zoomMin).toBe(1);
    expect(activeLens?.zoomMax).toBe(6);
    expect(activeLens?.zoomStep).toBe(0.1);
  });

  it('returns empty array when no videoinput devices', async () => {
    setupBrowserMocks();
    (global.navigator as any).mediaDevices.enumerateDevices = jest.fn().mockResolvedValue([]);

    const service = new CameraService();
    const lenses = await service.enumerateLenses();

    expect(lenses).toEqual([]);
  });
});

// ── CameraService.switchToLens ───────────────────────────────────────

describe('CameraService.switchToLens', () => {
  let service: CameraService;

  beforeEach(() => {
    setupBrowserMocks();
    service = new CameraService();
    // Set up internal state so switchToLens has data to work with
    (service as any)._lenses = [
      { deviceId: 'cam-wide', label: 'Back Camera', groupId: 'g1', facingMode: 'environment', zoomMin: 1, zoomMax: 6, zoomStep: 0.1, lensType: 'wide' },
      { deviceId: 'cam-tele', label: 'Telephoto', groupId: 'g1', facingMode: 'environment', zoomMin: 1, zoomMax: 3, zoomStep: 0.1, lensType: 'telephoto' },
      { deviceId: 'cam-front', label: 'Front Camera', groupId: 'g2', facingMode: 'user', zoomMin: null, zoomMax: null, zoomStep: null, lensType: 'front' },
    ];
  });

  it('uses applyConstraints for same-groupId lens switch with zoom support', async () => {
    const mocks = setupBrowserMocks();
    const track = mocks.track;
    track.getCapabilities = jest.fn().mockReturnValue({ zoom: { min: 1, max: 6, step: 0.1 } });
    track.getSettings = jest.fn().mockReturnValue({ deviceId: 'cam-wide' });

    // Set current stream with this track
    (service as any).currentStream = {
      getTracks: jest.fn().mockReturnValue([track]),
      getVideoTracks: jest.fn().mockReturnValue([track]),
      active: true,
    };

    await service.switchToLens('cam-tele');

    // Should use applyConstraints: telephoto maps to zoom=2
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] });
    // Should NOT restart the stream
    expect((global.navigator as any).mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('restarts stream for different groupId lens switch', async () => {
    const track = { stop: jest.fn(), getSettings: jest.fn().mockReturnValue({ deviceId: 'cam-wide' }), getCapabilities: jest.fn().mockReturnValue({}) };
    (service as any).currentStream = {
      getTracks: jest.fn().mockReturnValue([track]),
      getVideoTracks: jest.fn().mockReturnValue([track]),
      active: true,
    };
    (global.navigator as any).mediaDevices.getUserMedia = jest.fn().mockResolvedValue(
      { getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }]), getVideoTracks: jest.fn().mockReturnValue([]), active: true }
    );

    await service.switchToLens('cam-front');

    // Should restart stream with deviceId constraint
    expect((global.navigator as any).mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          deviceId: { exact: 'cam-front' },
        }),
      })
    );
  });

  it('falls back to stream restart when zoom is unsupported even with same groupId', async () => {
    const mocks = setupBrowserMocks();
    const track = mocks.track;
    track.getCapabilities = jest.fn().mockReturnValue({});
    track.getSettings = jest.fn().mockReturnValue({ deviceId: 'cam-wide' });
    (service as any).currentStream = {
      getTracks: jest.fn().mockReturnValue([track]),
      getVideoTracks: jest.fn().mockReturnValue([track]),
      active: true,
    };
    (global.navigator as any).mediaDevices.getUserMedia = jest.fn().mockResolvedValue(
      { getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }]), getVideoTracks: jest.fn().mockReturnValue([]), active: true }
    );

    await service.switchToLens('cam-tele');

    // Should NOT use applyConstraints (no zoom)
    expect(track.applyConstraints).not.toHaveBeenCalled();
    // Should restart stream
    expect((global.navigator as any).mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it('stops old stream tracks on cross-group switch', async () => {
    const oldTrack = { stop: jest.fn(), getSettings: jest.fn().mockReturnValue({ deviceId: 'cam-wide' }), getCapabilities: jest.fn().mockReturnValue({}) };
    (service as any).currentStream = {
      getTracks: jest.fn().mockReturnValue([oldTrack]),
      getVideoTracks: jest.fn().mockReturnValue([oldTrack]),
      active: true,
    };
    (global.navigator as any).mediaDevices.getUserMedia = jest.fn().mockResolvedValue(
      { getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }]), getVideoTracks: jest.fn().mockReturnValue([]), active: true }
    );

    await service.switchToLens('cam-front');

    expect(oldTrack.stop).toHaveBeenCalled();
  });

  it('throws when lens deviceId is not found', async () => {
    await expect(service.switchToLens('nonexistent')).rejects.toThrow('Lens not found');
  });
});

// ── CameraService.setZoom ────────────────────────────────────────────

describe('CameraService.setZoom', () => {
  let service: CameraService;

  beforeEach(() => {
    setupBrowserMocks();
    service = new CameraService();
  });

  it('applies zoom constraint on the active video track', async () => {
    const mocks = setupBrowserMocks();
    const track = mocks.track;
    track.getCapabilities = jest.fn().mockReturnValue({ zoom: { min: 1, max: 6, step: 0.1 } });
    (service as any).currentStream = {
      getTracks: jest.fn().mockReturnValue([track]),
      getVideoTracks: jest.fn().mockReturnValue([track]),
      active: true,
    };

    await service.setZoom(3);

    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 3 }] });
  });

  it('does nothing when no active stream', async () => {
    // No currentStream set
    await expect(service.setZoom(2)).resolves.toBeUndefined();
  });

  it('does nothing when zoom is not supported by device', async () => {
    const mocks = setupBrowserMocks();
    const track = mocks.track;
    track.getCapabilities = jest.fn().mockReturnValue({}); // no zoom capability
    (service as any).currentStream = {
      getTracks: jest.fn().mockReturnValue([track]),
      getVideoTracks: jest.fn().mockReturnValue([track]),
      active: true,
    };

    await service.setZoom(3);

    expect(track.applyConstraints).not.toHaveBeenCalled();
  });

  it('handles applyConstraints rejection gracefully', async () => {
    const mocks = setupBrowserMocks();
    const track = mocks.track;
    track.getCapabilities = jest.fn().mockReturnValue({ zoom: { min: 1, max: 6, step: 0.1 } });
    track.applyConstraints = jest.fn().mockRejectedValue(new Error('Constraint out of range'));
    (service as any).currentStream = {
      getTracks: jest.fn().mockReturnValue([track]),
      getVideoTracks: jest.fn().mockReturnValue([track]),
      active: true,
    };

    // Should not throw — error is caught gracefully
    await expect(service.setZoom(999)).resolves.toBeUndefined();
  });
});
