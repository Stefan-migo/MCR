/**
 * @jest-environment node
 */

import { LensInfo } from '../../lib/camera-service';

// Mock camera-service before imports
const mockEnumerateLenses = jest.fn();
const mockSwitchToLens = jest.fn();
const mockSetZoom = jest.fn();
const mockGetCameraInfo = jest.fn();
const mockGetCurrentStream = jest.fn();
const mockStopCamera = jest.fn();

jest.mock('../../lib/camera-service', () => ({
  CameraService: Object.assign(
    jest.fn().mockImplementation(() => ({
      enumerateLenses: mockEnumerateLenses,
      switchToLens: mockSwitchToLens,
      setZoom: mockSetZoom,
      getCameraInfo: mockGetCameraInfo,
      getCurrentStream: mockGetCurrentStream,
      stopCamera: mockStopCamera,
      initialize: jest.fn(),
      stream: null,
      lenses: [],
    })),
    {
      QUALITY_PRESETS: [
        { name: 'Low', width: 640, height: 480, frameRate: 15, bitrate: 200000 },
        { name: 'Medium', width: 1280, height: 720, frameRate: 24, bitrate: 500000 },
        { name: 'High', width: 1920, height: 1080, frameRate: 30, bitrate: 1000000 },
        { name: 'Ultra', width: 3840, height: 2160, frameRate: 30, bitrate: 2000000 },
      ],
      getOrCreateDeviceId: jest.fn(),
      isMobileDevice: jest.fn(),
      isIOSDevice: jest.fn(),
      supportsGetUserMedia: jest.fn(),
      getOptimalConstraints: jest.fn(),
    }
  ),
  LensType: {},
  determineLensType: jest.fn(),
  CameraConstraints: {},
  CameraQualityPreset: {},
}));

// We need to import the store AFTER the mock is set up
import { useStreamStore, getDefaultQualityPreset } from '../stream-store';

const mockLenses: LensInfo[] = [
  { deviceId: 'cam-wide', label: 'Back Camera', groupId: 'g1', facingMode: 'environment', zoomMin: 1, zoomMax: 6, zoomStep: 0.1, lensType: 'wide' },
  { deviceId: 'cam-front', label: 'Front Camera', groupId: 'g2', facingMode: 'user', zoomMin: null, zoomMax: null, zoomStep: null, lensType: 'front' },
];

describe('StreamStore — lens state', () => {
  beforeEach(() => {
    // Reset store to initial state
    useStreamStore.setState({
      lenses: [],
      selectedLensDeviceId: null,
      zoom: null,
      zoomMin: null,
      zoomMax: null,
      zoomSupported: false,
    });
    jest.clearAllMocks();
  });

  describe('setLenses', () => {
    it('updates lenses in state', () => {
      useStreamStore.getState().setLenses(mockLenses);
      const state = useStreamStore.getState();
      expect(state.lenses).toEqual(mockLenses);
      expect(state.lenses).toHaveLength(2);
    });

    it('auto-selects the first lens if none selected', () => {
      useStreamStore.getState().setLenses(mockLenses);
      const state = useStreamStore.getState();
      expect(state.selectedLensDeviceId).toBe('cam-wide');
    });

    it('does not change selection when lenses already selected', () => {
      useStreamStore.setState({ selectedLensDeviceId: 'cam-front' });
      useStreamStore.getState().setLenses(mockLenses);
      expect(useStreamStore.getState().selectedLensDeviceId).toBe('cam-front');
    });
  });

  describe('selectLens', () => {
    function mockStream(): MediaStream {
      // Minimal MediaStream-like object with getVideoTracks
      return { getVideoTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }

    it('calls cameraService.switchToLens with correct deviceId', async () => {
      mockSwitchToLens.mockResolvedValue(mockStream());

      useStreamStore.setState({
        cameraService: new (jest.requireMock('../../lib/camera-service').CameraService)(),
        lenses: mockLenses,
      });

      await useStreamStore.getState().selectLens('cam-front');

      expect(mockSwitchToLens).toHaveBeenCalledWith('cam-front');
    });

    it('updates selectedLensDeviceId after successful switch', async () => {
      mockSwitchToLens.mockResolvedValue(mockStream());

      useStreamStore.setState({
        cameraService: new (jest.requireMock('../../lib/camera-service').CameraService)(),
        lenses: mockLenses,
      });

      await useStreamStore.getState().selectLens('cam-front');

      expect(useStreamStore.getState().selectedLensDeviceId).toBe('cam-front');
    });

    it('does not update state when cameraService is null', async () => {
      useStreamStore.setState({ cameraService: null, lenses: mockLenses });
      await useStreamStore.getState().selectLens('cam-front');
      expect(mockSwitchToLens).not.toHaveBeenCalled();
    });

    it('derives zoom state from the target lens after switch', async () => {
      mockSwitchToLens.mockResolvedValue(mockStream());

      useStreamStore.setState({
        cameraService: new (jest.requireMock('../../lib/camera-service').CameraService)(),
        lenses: mockLenses,
      });

      // Select wide camera (has zoom 1-6)
      await useStreamStore.getState().selectLens('cam-wide');

      const state = useStreamStore.getState();
      expect(state.zoomMin).toBe(1);
      expect(state.zoomMax).toBe(6);
      expect(state.zoomSupported).toBe(true);
    });
  });

  describe('setZoom', () => {
    it('calls cameraService.setZoom with level', async () => {
      mockSetZoom.mockResolvedValue(undefined);

      useStreamStore.setState({
        cameraService: new (jest.requireMock('../../lib/camera-service').CameraService)(),
      });

      await useStreamStore.getState().setZoom(3);

      expect(mockSetZoom).toHaveBeenCalledWith(3);
    });

    it('updates zoom in state', async () => {
      mockSetZoom.mockResolvedValue(undefined);

      useStreamStore.setState({
        cameraService: new (jest.requireMock('../../lib/camera-service').CameraService)(),
        zoom: 1,
      });

      await useStreamStore.getState().setZoom(3);

      expect(useStreamStore.getState().zoom).toBe(3);
    });
  });

  describe('enumerateCameras', () => {
    it('calls cameraService.enumerateLenses and sets lenses', async () => {
      mockEnumerateLenses.mockResolvedValue(mockLenses);

      useStreamStore.setState({
        cameraService: new (jest.requireMock('../../lib/camera-service').CameraService)(),
      });

      await useStreamStore.getState().enumerateCameras();

      expect(mockEnumerateLenses).toHaveBeenCalled();
      expect(useStreamStore.getState().lenses).toEqual(mockLenses);
    });
  });
});

// ─── Task 1.6: Default quality preset by platform ──────────────────────

describe('getDefaultQualityPreset', () => {
  // QUALITY_PRESETS values (mirror CameraService — can't import mock's inner values)
  const presets = [
    { name: 'Low', width: 640, height: 480, frameRate: 15, bitrate: 200000 },
    { name: 'Medium', width: 1280, height: 720, frameRate: 24, bitrate: 500000 },
    { name: 'High', width: 1920, height: 1080, frameRate: 30, bitrate: 1000000 },
    { name: 'Ultra', width: 3840, height: 2160, frameRate: 30, bitrate: 2000000 },
  ] as const;

  it('returns Medium (720p) for mobile devices', () => {
    const preset = getDefaultQualityPreset(true, presets as any);
    expect(preset.name).toBe('Medium');
    expect(preset.width).toBe(1280);
    expect(preset.height).toBe(720);
    expect(preset.frameRate).toBe(24);
  });

  it('returns High (1080p) for desktop devices', () => {
    const preset = getDefaultQualityPreset(false, presets as any);
    expect(preset.name).toBe('High');
    expect(preset.width).toBe(1920);
    expect(preset.height).toBe(1080);
    expect(preset.frameRate).toBe(30);
  });
});
