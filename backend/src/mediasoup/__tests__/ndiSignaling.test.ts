import { NdiSignaling } from '../ndiSignaling';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProducer(id: string, kind: string, mimeType: string) {
  return {
    id,
    kind,
    rtpParameters: {
      codecs: [{ mimeType, payloadType: 101, clockRate: 90000 }],
      encodings: [{ ssrc: 12345 }],
    },
    close: jest.fn(),
    on: jest.fn(),
  };
}

function makeMockTransport(id: string) {
  return {
    id,
    iceParameters: { usernameFragment: 'ufrag', password: 'pass' },
    iceCandidates: [{ foundation: '1', ip: '127.0.0.1', port: 20001, protocol: 'udp', type: 'host' }],
    dtlsParameters: { fingerprints: [{ algorithm: 'sha-256', value: 'AA:BB:CC' }], role: 'auto' },
    close: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue({ id: 'consumer-1', kind: 'video', producerId: 'prod-1', rtpParameters: {}, on: jest.fn(), resume: jest.fn(), close: jest.fn() }),
    produce: jest.fn(),
    appData: {},
  };
}

interface CapturedHandlers {
  onConnection: Function | null;
  onNewProducer: Function | null;
  onProducerClosed: Function | null;
}

function setupSignaling() {
  const socketEmit = jest.fn();
  const socketOn = jest.fn();

  // Mock the namespace: io.of('/ndi-bridge') returns a namespace mock
  // that captures the connection handler.
  let connectionHandler: Function | null = null;
  const namespaceMock = {
    use: jest.fn(),
    on: jest.fn((event: string, handler: Function) => {
      if (event === 'connection') connectionHandler = handler;
    }),
  };

  const io = {
    of: jest.fn().mockReturnValue(namespaceMock),
  } as any;

  const createWebRtcTransport = jest.fn();
  const createPlainTransport = jest.fn();
  const getVideoProducers = jest.fn().mockReturnValue([]);
  const getRouterCapabilities = jest.fn().mockReturnValue({ codecs: [] });
  const getProducer = jest.fn();

  const handlers: CapturedHandlers = {
    onConnection: null,
    onNewProducer: null,
    onProducerClosed: null,
  };

  const router = {
    createWebRtcTransport,
    createPlainTransport,
    getVideoProducers,
    getRouterCapabilities,
    getProducer,
    on: jest.fn((event: string, handler: Function) => {
      if (event === 'new-producer') handlers.onNewProducer = handler;
      else if (event === 'producer-closed') handlers.onProducerClosed = handler;
    }),
  } as any;

  const config = {
    ndiBridge: { enabled: true, streamDiscovery: true },
    plainTransport: { listenIp: '0.0.0.0', portRangeStart: 20000, portRangeEnd: 21000 },
  } as any;

  const signaling = new NdiSignaling(io, router, config);
  signaling.init();

  // Capture the connection handler
  handlers.onConnection = connectionHandler;

  return {
    signaling, io, router,
    createWebRtcTransport, createPlainTransport,
    getVideoProducers, getRouterCapabilities, getProducer,
    handlers, socketEmit, socketOn, connectionHandler,
  };
}

async function simulateConnect(handlers: CapturedHandlers, socketEmit: jest.Mock, socketOn: jest.Mock) {
  const socket: any = { id: 'test-socket', emit: socketEmit, on: socketOn, handshake: { address: '127.0.0.1' } };
  const promise = handlers.onConnection!(socket);
  if (promise && typeof promise.then === 'function') await promise;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NdiSignaling — initialization (R-001)', () => {
  it('should create /ndi-bridge namespace on init', () => {
    const { signaling, handlers } = setupSignaling();
    expect(handlers.onConnection).toBeTruthy();
    expect(handlers.onNewProducer).toBeTruthy();
    expect(handlers.onProducerClosed).toBeTruthy();
    expect(signaling.getBridgeSession('nonexistent')).toBeUndefined();
  });
});

describe('NdiSignaling — bridge connects (WebRTC)', () => {
  it('should create WebRtcTransport and emit transport-created', async () => {
    const { socketEmit, socketOn, createWebRtcTransport, handlers } = setupSignaling();

    const transportMock = makeMockTransport('webrtc-1');
    createWebRtcTransport.mockResolvedValue(transportMock);
    getVideoProducers: jest.fn().mockReturnValue([]);

    await simulateConnect(handlers, socketEmit, socketOn);

    expect(createWebRtcTransport).toHaveBeenCalledTimes(1);
    expect(socketEmit).toHaveBeenCalledWith('transport-created', expect.objectContaining({
      id: 'webrtc-1',
      iceParameters: expect.any(Object),
    }));
    expect(socketEmit).toHaveBeenCalledWith('active-streams', { streams: [] });
  });

  it('should connect WebRTC transport on connect-webrtc event', async () => {
    const { socketEmit, socketOn, createWebRtcTransport, handlers } = setupSignaling();

    const transportMock = makeMockTransport('webrtc-1');
    createWebRtcTransport.mockResolvedValue(transportMock);

    await simulateConnect(handlers, socketEmit, socketOn);

    // Find connect-webrtc handler
    const connectHandler = socketOn.mock.calls.find((c: any[]) => c[0] === 'connect-webrtc')?.[1];
    expect(connectHandler).toBeDefined();

    socketEmit.mockClear();
    await connectHandler({ dtlsParameters: { role: 'client', fingerprints: [] } });

    expect(transportMock.connect).toHaveBeenCalledWith({ dtlsParameters: { role: 'client', fingerprints: [] } });
    expect(socketEmit).toHaveBeenCalledWith('transport-connected', { success: true });
  });

  it('should create Consumer on consume-stream', async () => {
    const { socketEmit, socketOn, createWebRtcTransport, getProducer, handlers } = setupSignaling();

    const transportMock = makeMockTransport('webrtc-1');
    createWebRtcTransport.mockResolvedValue(transportMock);
    getProducer.mockReturnValue(makeMockProducer('prod-1', 'video', 'video/H264'));

    await simulateConnect(handlers, socketEmit, socketOn);

    // Find consume-stream handler
    const consumeHandler = socketOn.mock.calls.find((c: any[]) => c[0] === 'consume-stream')?.[1];
    expect(consumeHandler).toBeDefined();

    socketEmit.mockClear();
    await consumeHandler({ producerId: 'prod-1' });

    expect(transportMock.consume).toHaveBeenCalledWith({
      producerId: 'prod-1',
      rtpCapabilities: { codecs: [] },
      paused: false,
    });
    expect(socketEmit).toHaveBeenCalledWith('consumer-ready', expect.objectContaining({
      producerId: 'prod-1',
    }));
  });

  it('should emit consumer-error when producer not found', async () => {
    const { socketEmit, socketOn, createWebRtcTransport, getProducer, handlers } = setupSignaling();

    createWebRtcTransport.mockResolvedValue(makeMockTransport('webrtc-1'));
    getProducer.mockReturnValue(undefined);

    await simulateConnect(handlers, socketEmit, socketOn);

    const consumeHandler = socketOn.mock.calls.find((c: any[]) => c[0] === 'consume-stream')?.[1];
    socketEmit.mockClear();
    await consumeHandler({ producerId: 'unknown-prod' });

    expect(socketEmit).toHaveBeenCalledWith('consumer-error', {
      producerId: 'unknown-prod',
      error: 'producer not found',
    });
  });

  it('should emit stream-started on new producer', async () => {
    const { socketEmit, socketOn, createWebRtcTransport, handlers } = setupSignaling();

    createWebRtcTransport.mockResolvedValue(makeMockTransport('webrtc-1'));

    await simulateConnect(handlers, socketEmit, socketOn);

    socketEmit.mockClear();
    handlers.onNewProducer!(makeMockProducer('prod-2', 'video', 'video/H264'));

    expect(socketEmit).toHaveBeenCalledWith('stream-started', expect.objectContaining({
      producerId: 'prod-2',
    }));
  });

  it('should emit stream-stopped when producer closes', async () => {
    const { socketEmit, socketOn, createWebRtcTransport, handlers } = setupSignaling();

    createWebRtcTransport.mockResolvedValue(makeMockTransport('webrtc-1'));

    await simulateConnect(handlers, socketEmit, socketOn);

    socketEmit.mockClear();
    handlers.onProducerClosed!('prod-1');

    expect(socketEmit).toHaveBeenCalledWith('stream-stopped', {
      producerId: 'prod-1',
      reason: 'producer-closed',
    });
  });

  it('should cleanup on disconnect', async () => {
    const { socketEmit, socketOn, createWebRtcTransport, getProducer, handlers } = setupSignaling();

    const transportMock = makeMockTransport('webrtc-1');
    createWebRtcTransport.mockResolvedValue(transportMock);
    getProducer.mockReturnValue(makeMockProducer('prod-1', 'video', 'video/H264'));

    await simulateConnect(handlers, socketEmit, socketOn);

    // Create a consumer first
    const consumeHandler = socketOn.mock.calls.find((c: any[]) => c[0] === 'consume-stream')?.[1];
    await consumeHandler({ producerId: 'prod-1' });

    // Simulate disconnect
    const disconnectHandler = socketOn.mock.calls.find((c: any[]) => c[0] === 'disconnect')?.[1];
    disconnectHandler();

    expect(transportMock.close).toHaveBeenCalled();
  });
});
