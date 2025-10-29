import { types as mediasoupTypes } from 'mediasoup';

export const mediasoupConfig = {
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
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
    ]
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
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video' as const,
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video' as const,
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '4d0032',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000
        }
      }
    ]
  },

  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: process.env.ANNOUNCED_IP || undefined
      }
    ],
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000
  },

  plainTransport: {
    listenIp: { 
      ip: '0.0.0.0', 
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1' 
    },
    rtcpMux: true,        // RTCP and RTP on same port (recommended)
    comedia: true,        // Server learns client IP from first RTP packet
    enableSrtp: false,    // Plain RTP (no encryption to NDI bridge)
    enableSctp: false,    // No data channel needed
    portRange: {
      min: 20000,         // Dedicated range for NDI bridge
      max: 20100          // 100 ports = 50 potential streams (rtcpMux=true)
    }
  }
};

export default mediasoupConfig;

