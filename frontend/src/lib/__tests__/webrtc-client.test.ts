/**
 * @jest-environment node
 */

import { WebRTCClient } from '../webrtc-client';

// ─── Task 1.1: isAndroid UA detection ──────────────────────────────────

describe('WebRTCClient.isAndroidDevice', () => {
  const OriginalUA = Object.getOwnPropertyDescriptor(
    navigator,
    'userAgent'
  )?.value;

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: OriginalUA,
      configurable: true,
    });
  });

  it('returns true for Android Chrome UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
      configurable: true,
    });
    expect(WebRTCClient.isAndroidDevice()).toBe(true);
  });

  it('returns true for Android Samsung Browser UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 12; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/20.0 Chrome/106.0.5249.126 Mobile Safari/537.36',
      configurable: true,
    });
    expect(WebRTCClient.isAndroidDevice()).toBe(true);
  });

  it('returns false for desktop Chrome UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    expect(WebRTCClient.isAndroidDevice()).toBe(false);
  });

  it('returns false for iOS Safari UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
      configurable: true,
    });
    expect(WebRTCClient.isAndroidDevice()).toBe(false);
  });

  it('returns false for desktop Firefox UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
      configurable: true,
    });
    expect(WebRTCClient.isAndroidDevice()).toBe(false);
  });
});

// ─── Task 1.2 + 1.3: getEncodings helper ──────────────────────────────

describe('WebRTCClient.getEncodings', () => {
  it('returns single encoding with maintain-resolution and 10Mbps for Android', () => {
    const encodings = WebRTCClient.getEncodings(false, true);
    expect(encodings).toHaveLength(1);
    expect(encodings[0]).toHaveProperty('degradationPreference', 'maintain-resolution');
    expect(encodings[0]).toHaveProperty('maxBitrate', 10_000_000);
    expect(encodings[0]).toHaveProperty('scaleResolutionDownBy', 1);
  });

  it('returns single encoding with 5Mbps for iOS', () => {
    const encodings = WebRTCClient.getEncodings(true, false);
    expect(encodings).toHaveLength(1);
    expect(encodings[0]).toHaveProperty('degradationPreference', 'maintain-resolution');
    expect(encodings[0]).toHaveProperty('maxBitrate', 5_000_000);
    expect(encodings[0]).toHaveProperty('scaleResolutionDownBy', 1);
  });

  it('returns 3 simulcast layers for desktop', () => {
    const encodings = WebRTCClient.getEncodings(false, false);
    expect(encodings).toHaveLength(3);
    // Layer 0: low
    expect(encodings[0]).toHaveProperty('scaleResolutionDownBy', 4);
    expect(encodings[0]).toHaveProperty('maxBitrate', 200_000);
    // Layer 1: medium
    expect(encodings[1]).toHaveProperty('scaleResolutionDownBy', 2);
    expect(encodings[1]).toHaveProperty('maxBitrate', 500_000);
    // Layer 2: high
    expect(encodings[2]).toHaveProperty('scaleResolutionDownBy', 1);
    expect(encodings[2]).toHaveProperty('maxBitrate', 4_000_000);
  });

  it('all layers carry maintain-resolution degradationPreference', () => {
    const desktop = WebRTCClient.getEncodings(false, false);
    desktop.forEach((enc) => {
      expect(enc).toHaveProperty('degradationPreference', 'maintain-resolution');
    });
    const android = WebRTCClient.getEncodings(false, true);
    android.forEach((enc) => {
      expect(enc).toHaveProperty('degradationPreference', 'maintain-resolution');
    });
  });

  it('returns Android encoding when both params are passed (Android checked first)', () => {
    // Android is checked before iOS in the implementation
    const encodings = WebRTCClient.getEncodings(true, true);
    expect(encodings).toHaveLength(1);
    expect(encodings[0]).toHaveProperty('maxBitrate', 10_000_000); // Android bitrate
  });
});

// ─── Task 1.4: VP8 filter ──────────────────────────────────────────────

describe('WebRTCClient.shouldFilterH264', () => {
  it('returns true for Android user agent', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';
    expect(WebRTCClient.shouldFilterH264(ua)).toBe(true);
  });

  it('returns true for MediaTek / buggy H.264 desktop UA', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 helio g90';
    expect(WebRTCClient.shouldFilterH264(ua)).toBe(true);
  });

  it('returns true for Redmi Note with MediaTek', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 12; Redmi Note 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36';
    expect(WebRTCClient.shouldFilterH264(ua)).toBe(true);
  });

  it('returns false for iOS Safari UAs', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
    expect(WebRTCClient.shouldFilterH264(ua)).toBe(false);
  });

  it('returns false for desktop Chrome without MediaTek', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(WebRTCClient.shouldFilterH264(ua)).toBe(false);
  });

  it('returns false for desktop Firefox without MediaTek UA', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(WebRTCClient.shouldFilterH264(ua)).toBe(false);
  });
});

describe('VP8 filter removes H.264 from rtpCapabilities', () => {
  it('filters out H.264 codecs from rtpCapabilities for Android UA', () => {
    const rtpCapabilities = {
      codecs: [
        { mimeType: 'video/VP8', payloadType: 96 },
        { mimeType: 'video/VP9', payloadType: 98 },
        { mimeType: 'video/H264', payloadType: 100 },
        { mimeType: 'video/H264', payloadType: 101 },
        { mimeType: 'audio/opus', payloadType: 111 },
      ],
    };
    const filtered = WebRTCClient.filterH264Codecs(rtpCapabilities as any);
    const codecTypes = filtered.codecs.map((c: any) => c.mimeType);
    expect(codecTypes).not.toContain('video/H264');
    expect(codecTypes).toContain('video/VP8');
    expect(codecTypes).toContain('video/VP9');
    expect(codecTypes).toContain('audio/opus');
  });

  it('preserves H.264 codecs for non-Android (iOS and desktop)', () => {
    const rtpCapabilities = {
      codecs: [
        { mimeType: 'video/VP8', payloadType: 96 },
        { mimeType: 'video/H264', payloadType: 100 },
        { mimeType: 'audio/opus', payloadType: 111 },
      ],
    };
    // No filtering happens — H.264 stays
    expect(
      rtpCapabilities.codecs.filter((c: any) =>
        c.mimeType.toLowerCase().includes('h264')
      )
    ).toHaveLength(1);
  });
});

// ─── Task 1.5: Adaptation counters ─────────────────────────────────────

describe('WebRTCClient.processQualitySample', () => {
  const thresholds = {
    cpu: 5,
    recovery: 10,
    bitrateReduction: 0.6,
  };

  it('increments cpuStruggleCount on cpu qualityLimitation', () => {
    const state = { cpuStruggleCount: 0, recoveryCount: 0, adapted: false };
    const result = WebRTCClient.processQualitySample(
      { qualityLimitationReason: 'cpu' },
      state,
      thresholds
    );
    expect(result.cpuStruggleCount).toBe(1);
    expect(result.recoveryCount).toBe(0);
    expect(result.action).toBe('none');
  });

  it('triggers adapt action at 5 consecutive cpu samples', () => {
    const state = { cpuStruggleCount: 4, recoveryCount: 0, adapted: false };
    const result = WebRTCClient.processQualitySample(
      { qualityLimitationReason: 'cpu' },
      state,
      thresholds
    );
    expect(result.cpuStruggleCount).toBe(5);
    expect(result.action).toBe('adapt');
    expect(result.adapted).toBe(true);
  });

  it('resets recoveryCount when cpu struggle occurs mid-recovery', () => {
    const state = { cpuStruggleCount: 0, recoveryCount: 3, adapted: true };
    const result = WebRTCClient.processQualitySample(
      { qualityLimitationReason: 'cpu' },
      state,
      thresholds
    );
    expect(result.recoveryCount).toBe(0); // reset on new struggle
    expect(result.cpuStruggleCount).toBe(1);
  });

  it('increments recoveryCount when adapted and reason is not cpu', () => {
    const state = { cpuStruggleCount: 0, recoveryCount: 0, adapted: true };
    const result = WebRTCClient.processQualitySample(
      { qualityLimitationReason: 'bandwidth' },
      state,
      thresholds
    );
    expect(result.recoveryCount).toBe(1);
    expect(result.action).toBe('none');
    expect(result.cpuStruggleCount).toBe(0);
  });

  it('triggers restore action at 10 consecutive normal samples', () => {
    const state = { cpuStruggleCount: 0, recoveryCount: 9, adapted: true };
    const result = WebRTCClient.processQualitySample(
      { qualityLimitationReason: 'bandwidth' },
      state,
      thresholds
    );
    expect(result.recoveryCount).toBe(10);
    expect(result.action).toBe('restore');
    expect(result.adapted).toBe(false);
    expect(result.cpuStruggleCount).toBe(0);
  });

  it('does not accumulate recoveryCount when not adapted', () => {
    const state = { cpuStruggleCount: 0, recoveryCount: 0, adapted: false };
    const result = WebRTCClient.processQualitySample(
      { qualityLimitationReason: 'bandwidth' },
      state,
      thresholds
    );
    expect(result.recoveryCount).toBe(0); // unchanged — not in adapted mode
    expect(result.action).toBe('none');
  });

  it('resets cpuStruggleCount when a non-cpu sample arrives before threshold', () => {
    const state = { cpuStruggleCount: 3, recoveryCount: 0, adapted: false };
    const result = WebRTCClient.processQualitySample(
      { qualityLimitationReason: 'bandwidth' },
      state,
      thresholds
    );
    expect(result.cpuStruggleCount).toBe(0); // reset on non-cpu when not adapted
    expect(result.action).toBe('none');
  });

  it('handles undefined qualityLimitationReason gracefully', () => {
    const state = { cpuStruggleCount: 0, recoveryCount: 0, adapted: false };
    const result = WebRTCClient.processQualitySample({}, state, thresholds);
    expect(result.action).toBe('none');
    expect(result.cpuStruggleCount).toBe(0);
  });

  it('does not increment recoveryCount beyond threshold unchanged', () => {
    // After restore, adapted=false, so no further recovery accumulation
    const state = { cpuStruggleCount: 0, recoveryCount: 10, adapted: false };
    const result = WebRTCClient.processQualitySample(
      { qualityLimitationReason: 'none' },
      state,
      thresholds
    );
    expect(result.recoveryCount).toBe(10); // unchanged
  });
});
