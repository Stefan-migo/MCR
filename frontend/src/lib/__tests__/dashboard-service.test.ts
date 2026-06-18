/**
 * @jest-environment node
 */

// No real socket — test the method wiring and callback contract

describe('DashboardService — NDI Control', () => {
  let DashboardService: any;
  let service: any;

  beforeEach(() => {
    jest.resetModules();
    // We test the public API by mocking socket.io
    jest.mock('socket.io-client', () => ({
      io: jest.fn(() => ({
        on: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        connected: false,
      })),
    }));

    DashboardService = require('../dashboard-service').DashboardService;
    service = new DashboardService('http://localhost:3001');
  });

  describe('setNdiControl', () => {
    it('emits set-ndi-control with deviceId, enabled, and ack callback', async () => {
      const emit = jest.fn();
      service.socket = { emit };

      const promise = service.setNdiControl('dev-1', true);
      // extract the callback from the emit call
      const args = emit.mock.calls[0];
      expect(args[0]).toBe('set-ndi-control');
      expect(args[1]).toEqual({ deviceId: 'dev-1', enabled: true, ndiName: undefined });
      expect(typeof args[2]).toBe('function');
      // resolve the ack
      args[2]({ success: true });
      await expect(promise).resolves.toEqual({ success: true });
    });

    it('emits set-ndi-control with ndiName when provided', async () => {
      const emit = jest.fn((event, data, cb) => cb({ success: true }));
      service.socket = { emit };

      const result = await service.setNdiControl('dev-1', true, 'CamLeft');

      expect(emit).toHaveBeenCalledWith('set-ndi-control', {
        deviceId: 'dev-1',
        enabled: true,
        ndiName: 'CamLeft',
      }, expect.any(Function));
      expect(result).toEqual({ success: true });
    });

    it('resolves with error when socket is missing', async () => {
      service.socket = null;
      const result = await service.setNdiControl('dev-1', true);
      expect(result).toEqual({ success: false, error: 'Not connected' });
    });
  });

  describe('onNdiControlUpdated callback', () => {
    it('is called when ndi-control-updated event fires', () => {
      const handlers: Record<string, Function> = {};
      service.socket = {
        on: jest.fn((event: string, handler: Function) => {
          handlers[event] = handler;
        }),
        emit: jest.fn(),
      };
      service.setupSocketHandlers();

      const callback = jest.fn();
      service.onNdiControlUpdated = callback;

      handlers['ndi-control-updated']({
        deviceId: 'dev-1',
        enabled: true,
        ndiSourceName: 'MCR-Cam1',
      });

      expect(callback).toHaveBeenCalledWith({
        deviceId: 'dev-1',
        enabled: true,
        ndiSourceName: 'MCR-Cam1',
      });
    });
  });
});
