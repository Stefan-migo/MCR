'use client';

import { io, Socket } from 'socket.io-client';
import { Device } from 'mediasoup-client';
import { getBackendWsUrl } from './url';

export class BrowserRecvConsumer {
  private socket: Socket | null = null;
  private device: Device | null = null;
  private recvTransport: any | null = null;
  private consumer: any | null = null;
  private serverUrl: string;
  private connStateHandler: ((state: string) => void) | null = null;

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || getBackendWsUrl();
  }

  async connect(): Promise<void> {
    // Reuse a shared socket per server URL to avoid multiple WS handshakes failing
    this.socket = getSharedSocket(this.serverUrl);
    if (this.socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      const onConnect = () => { cleanup(); resolve(); };
      const onError = (e: any) => { cleanup(); reject(e); };
      const cleanup = () => {
        this.socket?.off('connect', onConnect);
        this.socket?.off('connect_error', onError);
      };
      this.socket!.on('connect', onConnect);
      this.socket!.on('connect_error', onError);
    });
  }

  private async loadDevice(): Promise<any> {
    // Ensure socket is ready before proceeding
    if (!this.socket || !this.socket.connected) {
      await this.connect().catch(() => {});
    }
    if (!this.socket) throw new Error('Not connected');
    const { rtpCapabilities } = await new Promise<any>((resolve, reject) => {
      this.socket!.emit('get-rtp-capabilities', (resp: any) => {
        if (resp?.error) return reject(new Error(resp.error));
        resolve(resp);
      });
    });
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
    return rtpCapabilities as any;
  }

  private async createRecvTransport(): Promise<void> {
    if (!this.socket || !this.device) throw new Error('Device not ready');
    const transportInfo = await new Promise<any>((resolve, reject) => {
      this.socket!.emit('create-recv-transport', {}, (resp: any) => {
        if (resp?.error) return reject(new Error(resp.error));
        resolve(resp);
      });
    });

    this.recvTransport = this.device.createRecvTransport({
      id: transportInfo.id,
      iceParameters: transportInfo.iceParameters,
      iceCandidates: transportInfo.iceCandidates,
      dtlsParameters: transportInfo.dtlsParameters
    });

    this.recvTransport.on('connect', ({ dtlsParameters }: any, callback: any, errback: any) => {
      this.socket!.emit('connect-recv-transport', { transportId: this.recvTransport!.id, dtlsParameters }, (resp: any) => {
        if (resp?.success) return callback();
        errback(resp?.error ? new Error(resp.error) : new Error('connect failed'));
      });
    });

    this.recvTransport.on('connectionstatechange', (state: string) => {
      if (this.connStateHandler) this.connStateHandler(state);
    });
  }

  async consume(producerId: string): Promise<MediaStreamTrack> {
    await this.connect();
    await this.loadDevice();
    await this.createRecvTransport();

    const resp = await new Promise<any>((resolve, reject) => {
      this.socket!.emit(
        'consume-stream',
        {
          transportId: this.recvTransport!.id,
          producerId,
          rtpCapabilities: this.device!.rtpCapabilities
        },
        (r: any) => {
          if (r?.error) return reject(new Error(r.error));
          resolve(r);
        }
      );
    });

    this.consumer = await this.recvTransport!.consume({
      id: resp.id,
      producerId: resp.producerId,
      kind: resp.kind,
      rtpParameters: resp.rtpParameters
    });

    // Try resume (in case consumer is paused by server defaults)
    this.socket!.emit('resume-consumer', { consumerId: this.consumer.id }, () => {});

    return this.consumer.track as MediaStreamTrack;
  }

  async attachTo(videoEl: HTMLVideoElement, producerId: string): Promise<void> {
    const track = await this.consume(producerId);
    const attach = async () => {
      const ms = new MediaStream();
      ms.addTrack(track);
      videoEl.srcObject = ms;
      videoEl.muted = true;
      (videoEl as any).playsInline = true;
      try { await videoEl.play(); } catch {}
    };

    if ((track as any).muted) {
      // Wait until frames flow
      (track as any).onunmute = () => {
        (track as any).onunmute = null;
        attach();
      };
    } else {
      await attach();
    }
  }

  async close(): Promise<void> {
    try { this.consumer?.close?.(); } catch {}
    try { this.recvTransport?.close?.(); } catch {}
    // Do not disconnect shared socket; other previews/dashboard use it
    this.socket = null;
    this.consumer = null;
    this.recvTransport = null;
    this.device = null;
  }

  onConnectionStateChange(handler: (state: string) => void) {
    this.connStateHandler = handler;
  }
}

// Shared socket manager per server URL
const socketCache: Map<string, Socket> = new Map();
function getSharedSocket(serverUrl: string): Socket {
  let s = socketCache.get(serverUrl);
  if (s) return s;
  s = io(serverUrl, { transports: ['websocket'], forceNew: false, withCredentials: true });
  socketCache.set(serverUrl, s);
  return s;
}


