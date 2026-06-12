import { NdiSignaling } from '../ndiSignaling';
import { types as mediasoupTypes } from 'mediasoup';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProducer(id: string, kind: 'video' | 'audio', mimeType = 'video/VP8'): mediasoupTypes.Producer {
  return {
    id, kind,
    rtpParameters: {
      codecs: [{
        mimeType, payloadType: 96, clockRate: 90000,
        channels: undefined, parameters: {},
      }],
    },
  } as any;
}

function makeMockTransport(port: number) {
  return {
    id: `transport-${port}`,
    tuple: { localIp: '127.0.0.1', localPort: port },
    close: jest.fn(),
    consume: jest.fn().mockResolvedValue({ id: 'consumer-1', resume: jest.fn() }),
  };
}

interface CapturedHandlers {
  onConnection: Function | null;
  onNewProducer: Function | null;
  onProducerClosed: Function | null;
}

/**
 * Factory: creates fresh mocks + NdiSignaling instance each call.
 * Returns the instance, all mocks, and captured event handlers.
 */
function setupSignaling() {
  const socketEmit = jest.fn();
  const socketOn = jest.fn();
  const createPlainTransport = jest.fn();
  const getVideoProducers = jest.fn();
  const getRouterCapabilities = jest.fn().mockReturnValue({ codecs: [] });

  const handlers: CapturedHandlers = { onConnection: null, onNewProducer: null, onProducerClosed: null };

  const namespaceOn = jest.fn((event: string, handler: Function) => {
    if (event === 'connection') handlers.onConnection = handler;
  });
  const namespaceObj: any = { on: namespaceOn };
  namespaceObj.use = jest.fn().mockReturnValue(namespaceObj);

  const io = { of: jest.fn().mockReturnValue(namespaceObj) } as any;

  const routerOn = jest.fn((event: string, handler: Function) => {
    if (event === 'new-producer') handlers.onNewProducer = handler;
    if (event === 'producer-closed') handlers.onProducerClosed = handler;
  });
  const router = {
    on: routerOn,
    getVideoProducers,
    createPlainTransport,
    getRouterCapabilities,
  } as any;

  const config = {
    enabled: true, streamDiscovery: true,
    plainTransport: { listenIp: '127.0.0.1', portRangeStart: 20000, portRangeEnd: 21000 },
  };

  const signaling = new NdiSignaling(io, router, config);
  signaling.init();

  return { signaling, socketEmit, socketOn, createPlainTransport, getVideoProducers, getRouterCapabilities, handlers, routerOn };
}

/**
 * Simulates a bridge connection and waits for it to fully complete.
 */
async function simulateConnect(handlers: CapturedHandlers, socketEmit: jest.Mock, socketOn: jest.Mock) {
  const socket: any = { id: 'test-socket', emit: socketEmit, on: socketOn };
  const promise = handlers.onConnection!(socket);
  if (promise && typeof promise.then === 'function') await promise;
}

/**
 * Returns the disconnect handler registered on the socket.
 */
function getDisconnectHandler(socketOn: jest.Mock): Function {
  const call = socketOn.mock.calls.find((c: any[]) => c[0] === 'disconnect');
  if (!call) throw new Error('disconnect handler not registered');
  return call[1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NdiSignaling — initialization (R-001)', () => {
  it('should create /ndi-bridge namespace on init', () => {
    const { signaling, handlers } = setupSignaling();
    // setupSignaling already called init()

    // We verify indirectly: handlers captured the connection handler
    expect(handlers.onConnection).toBeTruthy();
    expect(handlers.onNewProducer).toBeTruthy();
    expect(handlers.onProducerClosed).toBeTruthy();
    expect(signaling.getBridgeSession('nonexistent')).toBeUndefined();
  });
});

describe('NdiSignaling — bridge connects with no producers (R-002)', () => {
  it('should emit active-streams with empty array when no producers', async () => {
    const { socketEmit, socketOn, getVideoProducers, createPlainTransport, handlers } = setupSignaling();
    getVideoProducers.mockReturnValue([]);
    createPlainTransport.mockResolvedValue(makeMockTransport(20001));

    await simulateConnect(handlers, socketEmit, socketOn);

    expect(getVideoProducers).toHaveBeenCalled();
    expect(createPlainTransport).not.toHaveBeenCalled();
    expect(socketEmit).toHaveBeenCalledWith('active-streams', { streams: [] });
  });
});

describe('NdiSignaling — bridge connects with active producers (R-002)', () => {
  it('should emit active-streams with 2 producers when 2 video producers exist', async () => {
    const { socketEmit, socketOn, getVideoProducers, createPlainTransport, handlers } = setupSignaling();
    const producers = [
      makeMockProducer('prod-1', 'video', 'video/VP8'),
      makeMockProducer('prod-2', 'video', 'video/H264'),
    ];
    getVideoProducers.mockReturnValue(producers);

    createPlainTransport.mockResolvedValue(makeMockTransport(20001));
    // Make second call return a different port
    const firstPromise = Promise.resolve(makeMockTransport(20001));
    const secondPromise = Promise.resolve(makeMockTransport(20002));
    // Use mockReturnValueOnce for sequence
    createPlainTransport
      .mockReset()
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    await simulateConnect(handlers, socketEmit, socketOn);

    expect(createPlainTransport).toHaveBeenCalledTimes(2);
    expect(socketEmit).toHaveBeenCalledWith('active-streams', {
      streams: [
        {
          producerId: 'prod-1',
          codec: { mimeType: 'video/VP8', payloadType: 96, clockRate: 90000, channels: undefined, parameters: {} },
          rtpEndpoint: { ip: '127.0.0.1', port: 20001 },
        },
        {
          producerId: 'prod-2',
          codec: { mimeType: 'video/H264', payloadType: 96, clockRate: 90000, channels: undefined, parameters: {} },
          rtpEndpoint: { ip: '127.0.0.1', port: 20002 },
        },
      ],
    });
  });
});

describe('NdiSignaling — new producer creates PlainTransport (R-003)', () => {
  it('should create PlainTransport and emit stream-started for new video producer', async () => {
    const { socketEmit, socketOn, getVideoProducers, createPlainTransport, handlers } = setupSignaling();
    getVideoProducers.mockReturnValue([]);
    createPlainTransport.mockResolvedValue(makeMockTransport(20001));

    await simulateConnect(handlers, socketEmit, socketOn);

    // Clear all emit calls from connection
    socketEmit.mockClear();

    // Now simulate a new video producer
    await handlers.onNewProducer!(makeMockProducer('prod-new', 'video', 'video/VP8'));

    expect(createPlainTransport).toHaveBeenCalledTimes(1);
    expect(createPlainTransport).toHaveBeenCalledWith({
      listenIp: { ip: '127.0.0.1', announcedIp: undefined },
      rtcpMux: false,
      comedia: true,
    });
    expect(socketEmit).toHaveBeenCalledWith('stream-started', {
      producerId: 'prod-new',
      codec: { mimeType: 'video/VP8', payloadType: 96, clockRate: 90000, channels: undefined, parameters: {} },
      rtpEndpoint: { ip: '127.0.0.1', port: 20001 },
    });
  });

  it('should NOT create PlainTransport for audio producers', async () => {
    const { socketEmit, socketOn, getVideoProducers, createPlainTransport, handlers } = setupSignaling();
    getVideoProducers.mockReturnValue([]);
    await simulateConnect(handlers, socketEmit, socketOn);

    await handlers.onNewProducer!(makeMockProducer('prod-audio', 'audio', 'audio/opus'));

    expect(createPlainTransport).not.toHaveBeenCalled();
  });
});

describe('NdiSignaling — producer stopped closes transport (R-004)', () => {
  it('should close transport and emit stream-stopped when producer closes', async () => {
    const { socketEmit, socketOn, getVideoProducers, createPlainTransport, handlers } = setupSignaling();
    getVideoProducers.mockReturnValue([]);
    // Use a manually tracked close mock
    const closeFn = jest.fn();
    createPlainTransport.mockResolvedValue(makeMockTransport(20001));
    // Override close on the resolved transport
    createPlainTransport.mockImplementation(async () => {
      const t = makeMockTransport(20001);
      t.close = closeFn;
      return t;
    });

    await simulateConnect(handlers, socketEmit, socketOn);
    await handlers.onNewProducer!(makeMockProducer('prod-to-close', 'video', 'video/VP8'));

    // Clear emit to isolate stream-stopped call
    socketEmit.mockClear();

    // Simulate producer closing
    await handlers.onProducerClosed!('prod-to-close');

    expect(closeFn).toHaveBeenCalledTimes(1);
    expect(socketEmit).toHaveBeenCalledWith('stream-stopped', {
      producerId: 'prod-to-close',
      reason: 'producer-closed',
    });
  });
});

describe('NdiSignaling — bridge disconnect cleans up (R-005)', () => {
  it('should close all transports and remove session on disconnect', async () => {
    const { signaling, socketEmit, socketOn, getVideoProducers, createPlainTransport, handlers } = setupSignaling();

    const closeMock1 = jest.fn();
    const closeMock2 = jest.fn();
    let callNo = 0;
    createPlainTransport.mockImplementation(() => {
      callNo++;
      const t = makeMockTransport(20000 + callNo);
      t.close = callNo === 1 ? closeMock1 : closeMock2;
      return Promise.resolve(t);
    });

    getVideoProducers.mockReturnValue([
      makeMockProducer('prod-1', 'video'),
      makeMockProducer('prod-2', 'video'),
    ]);

    await simulateConnect(handlers, socketEmit, socketOn);
    expect(signaling.getBridgeSession('test-socket')).toBeDefined();

    // Trigger disconnect
    const disconnectHandler = getDisconnectHandler(socketOn);
    await disconnectHandler();

    expect(closeMock1).toHaveBeenCalledTimes(1);
    expect(closeMock2).toHaveBeenCalledTimes(1);
    expect(signaling.getBridgeSession('test-socket')).toBeUndefined();
  });
});

describe('NdiSignaling — port exhaustion handled gracefully (R-008)', () => {
  it('should emit error events instead of crashing on port exhaustion', async () => {
    const { socketEmit, socketOn, getVideoProducers, createPlainTransport, handlers } = setupSignaling();
    getVideoProducers.mockReturnValue([]);
    await simulateConnect(handlers, socketEmit, socketOn);

    // Make createPlainTransport fail
    createPlainTransport.mockRejectedValue(new Error('Port exhaustion: no available ports'));

    // Should not throw
    await handlers.onNewProducer!(makeMockProducer('prod-fail-1', 'video'));
    await handlers.onNewProducer!(makeMockProducer('prod-fail-2', 'video'));

    const errorCalls = socketEmit.mock.calls.filter((c: any[]) => c[0] === 'error');
    expect(errorCalls.length).toBeGreaterThanOrEqual(2);
    errorCalls.forEach((call: any[]) => {
      expect(call[1]).toHaveProperty('code', 'PORT_EXHAUSTION');
      expect(call[1]).toHaveProperty('message');
    });
  });
});

describe('NdiSignaling — multiple concurrent bridges (R-006)', () => {
  it('should maintain independent transport sets per bridge', async () => {
    const { signaling, getVideoProducers, createPlainTransport, handlers } = setupSignaling();
    createPlainTransport.mockResolvedValue(makeMockTransport(20001));

    // Bridge A connects
    getVideoProducers.mockReturnValue([makeMockProducer('prod-a', 'video')]);
    const emitA = jest.fn();
    const onA = jest.fn();
    await simulateConnect(handlers, emitA, onA);

    // Bridge B connects
    getVideoProducers.mockReturnValue([makeMockProducer('prod-b', 'video')]);
    const emitB = jest.fn();
    const onB = jest.fn();
    const socketB: any = { id: 'bridge-b', emit: emitB, on: onB };
    await handlers.onConnection!(socketB);

    expect(signaling.getBridgeSession('test-socket')).toBeDefined();
    expect(signaling.getBridgeSession('bridge-b')).toBeDefined();

    // Disconnect A only
    const disconnectA = onA.mock.calls.find((c: any[]) => c[0] === 'disconnect')?.[1];
    await disconnectA!();

    expect(signaling.getBridgeSession('test-socket')).toBeUndefined();
    expect(signaling.getBridgeSession('bridge-b')).toBeDefined();
  });
});
