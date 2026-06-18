/**
 * @jest-environment node
 */

import { useDashboardStore } from '../dashboard-store';

// Mock dashboard-service
jest.mock('../../lib/dashboard-service', () => ({
  DashboardService: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    setStreamQuality: jest.fn(),
    setNdiControl: jest.fn(),
    getActiveStreams: jest.fn().mockResolvedValue([]),
    updateStreamName: jest.fn().mockResolvedValue(true),
    disconnectStream: jest.fn().mockResolvedValue(true),
  })),
  StreamInfo: {},
}));

describe('DashboardStore — NDI Control State', () => {
  beforeEach(() => {
    // Reset store between tests
    useDashboardStore.setState({
      streams: [],
      devices: [],
      ndiStates: {},
      selectedDeviceId: null,
      selectedStream: null,
      isConnected: false,
      isLoading: false,
      error: null,
      dashboardService: null,
    });
  });

  describe('selectDevice', () => {
    it('opens modal by setting selectedDeviceId', () => {
      useDashboardStore.getState().selectDevice('dev-1');
      expect(useDashboardStore.getState().selectedDeviceId).toBe('dev-1');
    });

    it('closes modal by setting selectedDeviceId to null', () => {
      useDashboardStore.getState().selectDevice('dev-1');
      useDashboardStore.getState().selectDevice(null);
      expect(useDashboardStore.getState().selectedDeviceId).toBeNull();
    });
  });

  describe('setNdiState', () => {
    it('sets NDI state for a device', () => {
      useDashboardStore.getState().setNdiState('dev-1', {
        enabled: true,
        ndiSourceName: 'MCR-cam1',
        loading: false,
      });
      const state = useDashboardStore.getState().ndiStates['dev-1'];
      expect(state).toBeDefined();
      expect(state.enabled).toBe(true);
      expect(state.ndiSourceName).toBe('MCR-cam1');
      expect(state.deviceId).toBe('dev-1');
    });

    it('merges partial state updates', () => {
      useDashboardStore.getState().setNdiState('dev-1', {
        enabled: true,
        ndiSourceName: null,
        loading: true,
      });
      useDashboardStore.getState().setNdiState('dev-1', { loading: false });
      const state = useDashboardStore.getState().ndiStates['dev-1'];
      expect(state.enabled).toBe(true);
      expect(state.loading).toBe(false);
    });
  });

  describe('setNdiControl', () => {
    it('calls dashboardService.setNdiControl with correct args', async () => {
      const mockSetNdiControl = jest.fn().mockResolvedValue({ success: true });
      useDashboardStore.setState({
        dashboardService: { setNdiControl: mockSetNdiControl } as any,
      });

      await useDashboardStore.getState().setNdiControl('dev-1', true, 'CamLeft');

      expect(mockSetNdiControl).toHaveBeenCalledWith('dev-1', true, 'CamLeft');
    });

    it('sets optimistic loading state before emitting', async () => {
      const resolvePromise: Promise<{ success: boolean }> = new Promise(resolve => {
        // hold the promise open during the test
        setTimeout(() => resolve({ success: true }), 100);
      });
      useDashboardStore.setState({
        dashboardService: { setNdiControl: jest.fn().mockReturnValue(resolvePromise) } as any,
      });

      // fire and don't await yet to check optimistic state
      const controlPromise = useDashboardStore.getState().setNdiControl('dev-2', true);

      // Give the microtask queue a tick
      await new Promise(setTimeout);

      const state = useDashboardStore.getState().ndiStates['dev-2'];
      expect(state).toBeDefined();
      expect(state.enabled).toBe(true);
      expect(state.loading).toBe(true);

      await controlPromise;
    });

    it('reverts optimistic state on backend error', async () => {
      useDashboardStore.setState({
        dashboardService: { setNdiControl: jest.fn().mockResolvedValue({ success: false, error: 'Bridge offline' }) } as any,
      });

      await useDashboardStore.getState().setNdiControl('dev-1', true);

      const state = useDashboardStore.getState().ndiStates['dev-1'];
      expect(state.enabled).toBe(false);
      expect(state.loading).toBe(false);
    });

    it('does nothing when service is not initialized', async () => {
      // dashboardService is null (default)
      await expect(
        useDashboardStore.getState().setNdiControl('dev-1', true)
      ).resolves.toBeUndefined();
    });
  });

  describe('updateNdiControlState', () => {
    it('updates NDI state from ndi-control-updated event', () => {
      useDashboardStore.getState().setNdiState('dev-1', {
        enabled: true,
        ndiSourceName: null,
        loading: true,
      });

      useDashboardStore.getState().updateNdiControlState('dev-1', {
        enabled: true,
        active: true,
        ndiName: 'MCR-Cam1',
      });

      const state = useDashboardStore.getState().ndiStates['dev-1'];
      expect(state.enabled).toBe(true);
      expect(state.ndiSourceName).toBe('MCR-Cam1');
      expect(state.loading).toBe(false);
    });

    it('creates NDI state for a new deviceId', () => {
      useDashboardStore.getState().updateNdiControlState('dev-new', {
        enabled: true,
        active: true,
        ndiName: 'MCR-New',
      });

      const state = useDashboardStore.getState().ndiStates['dev-new'];
      expect(state).toBeDefined();
      expect(state.enabled).toBe(true);
      expect(state.deviceId).toBe('dev-new');
    });

    it('handles NDI disable update', () => {
      useDashboardStore.getState().setNdiState('dev-1', {
        enabled: true,
        ndiSourceName: 'MCR-Cam1',
        loading: false,
      });

      useDashboardStore.getState().updateNdiControlState('dev-1', {
        enabled: false,
        active: false,
        ndiName: null,
      });

      const state = useDashboardStore.getState().ndiStates['dev-1'];
      expect(state.enabled).toBe(false);
    });
  });

  describe('disconnectService cleanup', () => {
    it('clears NDI state on disconnect', async () => {
      useDashboardStore.setState({
        ndiStates: { 'dev-1': { deviceId: 'dev-1', enabled: true, ndiSourceName: 'MCR-1', loading: false } },
        selectedDeviceId: 'dev-1',
        dashboardService: { disconnect: jest.fn().mockResolvedValue(undefined) } as any,
        isConnected: true,
        streams: [],
      });

      await useDashboardStore.getState().disconnectService();

      const state = useDashboardStore.getState();
      expect(state.ndiStates).toEqual({});
      expect(state.selectedDeviceId).toBeNull();
    });
  });
});
