import { types as mediasoupTypes } from 'mediasoup';
import path from 'path';
import { getAnnouncedIp } from '../utils/network';

// Get the correct worker path for workspace setup
const getWorkerPath = () => {
  const isWindows = process.platform === 'win32';
  const workerExecutable = isWindows ? 'mediasoup-worker.exe' : 'mediasoup-worker';
  
  // Try multiple possible paths for the mediasoup worker
  const possiblePaths = [
    path.join(__dirname, `../../../node_modules/mediasoup/worker/out/Release/${workerExecutable}`),
    path.join(__dirname, `../../../../node_modules/mediasoup/worker/out/Release/${workerExecutable}`),
    path.join(process.cwd(), `node_modules/mediasoup/worker/out/Release/${workerExecutable}`),
    workerExecutable // fallback to default
  ];
  
  for (const workerPath of possiblePaths) {
    try {
      require('fs').accessSync(workerPath, require('fs').constants.F_OK);
      console.log(`✅ Found mediasoup worker at: ${workerPath}`);
      return workerPath;
    } catch (error) {
      // Path doesn't exist, try next one
    }
  }
  
  console.log('⚠️ Using default mediasoup worker path');
  return workerExecutable;
};

export interface NdiBridgeConfig {
  enabled: boolean;
  streamDiscovery: boolean;
  plainTransport: PlainTransportConfig;
}

export interface PlainTransportConfig {
  listenIp: string;
  portRangeStart: number;
  portRangeEnd: number;
}

export const mediasoupConfig = {
  worker: {
    rtcMinPort: 20000,
    rtcMaxPort: 21000,
    logLevel: 'warn' as const,
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      'rtx',
      'bwe',
      'score',
      'simulcast',
      'svc'
    ],
    workerPath: getWorkerPath()
  } as mediasoupTypes.WorkerSettings,

  router: {
    mediaCodecs: [
      {
        kind: 'audio' as const,
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        parameters: {
          minptime: 10,
          useinbandfec: 1
        }
      },
      // H.264 first — hardware encoding on most devices = lowest latency.
      // Profile 42e01f (baseline) is universally supported for WebRTC.
      {
        kind: 'video' as const,
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000
        },
        rtcpFeedback: [
          { type: 'nack' },
          { type: 'nack', parameter: 'pli' },
          { type: 'ccm', parameter: 'fir' }
        ]
      },
      // H.264 High Profile 4.1 (640c1f) — enables iOS hardware encoder negotiation
      {
        kind: 'video' as const,
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '640c1f',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000
        },
        rtcpFeedback: [
          { type: 'nack' },
          { type: 'nack', parameter: 'pli' },
          { type: 'ccm', parameter: 'fir' }
        ]
      },
      // VP8 fallback — some chipsets (MediaTek Helio G90T / Redmi Note 8 Pro)
      // have a buggy H.264 hardware encoder that creates producers but
      // sends 0 bytes. If H.264 doesn't work, browser falls back to VP8.
      {
        kind: 'video' as const,
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000
        },
        rtcpFeedback: [
          { type: 'nack' },
          { type: 'nack', parameter: 'pli' },
          { type: 'ccm', parameter: 'fir' }
        ]
      },
      {
        kind: 'video' as const,
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000
        }
      }
    ]
  },

  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: getAnnouncedIp()
      },
      {
        ip: '::',
        announcedIp: process.env.ANNOUNCED_IP || process.env.MEDIASOUP_ANNOUNCED_IP || undefined
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 10000000,
    initialAvailableOutgoingBitrate: 1000000
  },

  plainTransport: {
    listenIp: '127.0.0.1',
    portRangeStart: parseInt(process.env.PLAIN_TRANSPORT_PORT_RANGE_START || '20000', 10),
    portRangeEnd: parseInt(process.env.PLAIN_TRANSPORT_PORT_RANGE_END || '21000', 10),
  },

  ndiBridge: {
    enabled: process.env.NDI_BRIDGE_ENABLED === 'true',
    streamDiscovery: true,
    plainTransport: {
      listenIp: '0.0.0.0',
      portRangeStart: parseInt(process.env.PLAIN_TRANSPORT_PORT_RANGE_START || '20000', 10),
      portRangeEnd: parseInt(process.env.PLAIN_TRANSPORT_PORT_RANGE_END || '21000', 10),
    },
  }
};

export default mediasoupConfig;

