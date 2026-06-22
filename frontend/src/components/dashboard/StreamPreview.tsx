'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserRecvConsumer } from '../../lib/webrtc-consumer';

// ── Shared consumer cache: one consumer per producerId ──────────────
// Prevents duplicate WebRTC consumers when the same stream is shown
// in both the card and the modal (which doubles bandwidth and causes lag).
interface CachedEntry {
  consumer: BrowserRecvConsumer;
  stream: MediaStream;
  refCount: number;
}
const streamCache = new Map<string, CachedEntry>();

function acquireStream(producerId: string): { consumer: BrowserRecvConsumer; stream: MediaStream } | null {
  const entry = streamCache.get(producerId);
  if (!entry) return null;
  entry.refCount++;
  return { consumer: entry.consumer, stream: entry.stream };
}

function releaseStream(producerId: string) {
  const entry = streamCache.get(producerId);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    streamCache.delete(producerId);
    entry.consumer.close().catch(() => {});
    entry.stream.getTracks().forEach(t => t.stop());
  }
}
// ───────────────────────────────────────────────────────────────────

type StreamPreviewProps = {
  producerId: string;
  mirrored?: boolean;
  objectFit?: 'cover' | 'contain';
  fillMode?: 'fill' | 'fitHeight';
  className?: string;
  onDimensions?: (dims: { width: number; height: number }) => void;
};

export default function StreamPreview({ producerId, mirrored = true, objectFit = 'cover', fillMode = 'fill', className, onDimensions }: StreamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAttached, setIsAttached] = useState<boolean>(false);
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(null);

  // Attach a MediaStream to the video element and set up metadata callbacks
  const attachStream = (el: HTMLVideoElement, stream: MediaStream) => {
    el.srcObject = stream;
    el.muted = true;
    (el as any).playsInline = true;
    el.play().catch(() => {});
    setIsAttached(true);
    const updateMeta = () => {
      const dims = { width: el.videoWidth || 0, height: el.videoHeight || 0 };
      setMeta(dims);
      try { onDimensions?.(dims); } catch {}
    };
    el.onloadedmetadata = updateMeta;
    (el as any).onresize = updateMeta;
    updateMeta();
  };

  useEffect(() => {
    if (!producerId || !videoRef.current) return;

    // Check if another instance is already consuming this producerId
    const cached = acquireStream(producerId);
    if (cached) {
      console.log('[StreamPreview] reusing cached stream for', producerId);
      attachStream(videoRef.current, cached.stream);
      return;
    }

    // No cached stream — create a new consumer
    let consumer: BrowserRecvConsumer | null = null;
    let mounted = true;
    (async () => {
      try {
        setError(null);
        setIsAttached(false);
        consumer = new BrowserRecvConsumer();
        const track = await consumer.consume(producerId);
        if (!mounted) { consumer.close(); return; }
        const ms = new MediaStream();
        ms.addTrack(track);

        // Cache so the modal / other instances reuse this stream
        streamCache.set(producerId, { consumer, stream: ms, refCount: 1 });

        if (videoRef.current) {
          attachStream(videoRef.current, ms);
        }
      } catch (e) {
        if (!mounted) return;
        console.warn('[StreamPreview] attach failed', e);
        setError((e as any)?.message || String(e));
      }
    })();

    return () => {
      mounted = false;
      releaseStream(producerId);
    };
  }, [producerId]);

  return (
    <div className={"relative w-full h-full group " + (className || '')}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => {
          const el = videoRef.current;
          if (!el) return;
          if (el.videoWidth && el.videoHeight) {
            const dims = { width: el.videoWidth, height: el.videoHeight };
            setMeta(dims);
            try { onDimensions?.(dims); } catch {}
          }
        }}
        onPlaying={() => {
          setIsAttached(true);
          const el = videoRef.current;
          if (el && el.videoWidth && el.videoHeight) {
            const dims = { width: el.videoWidth, height: el.videoHeight };
            setMeta(dims);
            try { onDimensions?.(dims); } catch {}
          }
        }}
        className={fillMode === 'fitHeight' ? 'h-full bg-black' : 'w-full h-full bg-black'}
        style={{
          transform: mirrored ? 'scaleX(-1)' : undefined,
          objectFit: objectFit,
          width: fillMode === 'fitHeight' ? 'auto' : undefined,
          height: fillMode === 'fitHeight' ? '100%' : undefined,
        }}
      />
      {/* Restart button (hover to show) */}
      <button
        type="button"
        className="absolute bottom-2 right-2 z-10 text-white bg-black/40 hover:bg-black/60 rounded px-2 py-1 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={async (e) => {
          e.stopPropagation();
          setError(null);
          setIsAttached(false);
          setMeta(null);
          // Force cleanup and recreate
          releaseStream(producerId);
          const el = videoRef.current;
          if (el) {
            try { (el.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()); } catch {}
            (el as any).srcObject = null;
          }
          // Re-run effect by scheduling a micro-task after state clears
          setTimeout(() => {
            if (videoRef.current && producerId) {
              (async () => {
                try {
                  const c = new BrowserRecvConsumer();
                  const track = await c.consume(producerId);
                  const ms = new MediaStream();
                  ms.addTrack(track);
                  streamCache.set(producerId, { consumer: c, stream: ms, refCount: 1 });
                  if (videoRef.current) {
                    videoRef.current.srcObject = ms;
                    videoRef.current.play().catch(() => {});
                    setIsAttached(true);
                  }
                } catch (e: any) {
                  setError(e?.message || 'Restart failed');
                }
              })();
            }
          }, 0);
        }}
      >
        Restart
      </button>
    </div>
  );
}
