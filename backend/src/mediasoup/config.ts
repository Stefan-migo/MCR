import { types as mediasoupTypes } from 'mediasoup';
import path from 'path';

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

export const mediasoupConfig = {
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 12000,
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
        announcedIp: process.env.ANNOUNCED_IP_V4 || process.env.PUBLIC_IP || '192.168.100.11'
      },
      {
        ip: '::',
        announcedIp: process.env.ANNOUNCED_IP || process.env.MEDIASOUP_ANNOUNCED_IP || undefined
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000
  }
};

export default mediasoupConfig;

