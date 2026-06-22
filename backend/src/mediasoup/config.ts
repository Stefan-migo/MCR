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
    rtcMaxPort: 20100,
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
      // H264 first — hardware encoding on iOS/iPhone, lowest latency.
      // WKWebView (used by CriOS/Chrome on iOS) handles H264 natively.
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
      // H.264 High Profile — iOS hardware encoder
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
      // VP8 fallback — for devices where H264 doesn't work
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
      // VP9 — higher efficiency for capable devices
      {
        kind: 'video' as const,
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 0,
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
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 10000000,
    initialAvailableOutgoingBitrate: 5000000
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

