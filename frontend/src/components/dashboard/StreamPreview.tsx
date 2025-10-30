'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserRecvConsumer } from '../../lib/webrtc-consumer';

type StreamPreviewProps = {
  producerId: string;
  mirrored?: boolean;
};

export default function StreamPreview({ producerId, mirrored = true }: StreamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const consumerRef = useRef<BrowserRecvConsumer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAttached, setIsAttached] = useState<boolean>(false);
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(null);
  const [connState, setConnState] = useState<string>('new');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        setIsAttached(false);
        // eslint-disable-next-line no-console
        console.log('[StreamPreview] effect start', { producerId });
        if (!producerId || !videoRef.current) return;
        if (consumerRef.current) return;
        const consumer = new BrowserRecvConsumer();
        consumer.onConnectionStateChange((state) => setConnState(state));
        consumerRef.current = consumer;
        let attempts = 0;
        const maxAttempts = 5;
        while (attempts < maxAttempts) {
          try {
            // eslint-disable-next-line no-console
            console.log('[StreamPreview] attach attempt', attempts + 1);
            await consumer.attachTo(videoRef.current, producerId);
            // eslint-disable-next-line no-console
            console.log('[StreamPreview] attach success');
            setIsAttached(true);
            try {
              const el = videoRef.current;
              if (el) {
                const updateMeta = () => setMeta({ width: el.videoWidth || 0, height: el.videoHeight || 0 });
                el.onloadedmetadata = updateMeta;
                el.onresize = updateMeta as any;
                // Initial sample (some browsers set dimensions immediately)
                updateMeta();
              }
            } catch {}
            break;
          } catch (err) {
            attempts += 1;
            if (attempts >= maxAttempts) throw err;
            await new Promise(r => setTimeout(r, 400 * attempts));
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Preview attach failed', e);
        try {
          const msg = (e as any)?.message || String(e);
          setError(msg);
        } catch {}
      }
    })();

    return () => {
      mounted = false;
      (async () => {
        try { await consumerRef.current?.close(); } catch {}
        consumerRef.current = null;
        if (videoRef.current) {
          try { (videoRef.current.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()); } catch {}
          (videoRef.current as any).srcObject = null;
        }
      })();
    };
  }, [producerId]);

  return (
    <div className="relative w-full h-full group">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => {
          const el = videoRef.current;
          if (!el) return;
          if (el.videoWidth && el.videoHeight) {
            setMeta({ width: el.videoWidth, height: el.videoHeight });
          }
        }}
        onPlaying={() => {
          setIsAttached(true);
          const el = videoRef.current;
          if (el && el.videoWidth && el.videoHeight) {
            setMeta({ width: el.videoWidth, height: el.videoHeight });
          }
        }}
        className="w-full h-full object-cover bg-black"
        style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
      />
      {/* Minimal debug: connection state bottom-left, restart top-right */}
      <div className="absolute bottom-2 left-2 text-[10px] text-white bg-black/40 px-1.5 py-0.5 rounded z-10">
        {error ? `Error: ${error}` : `State: ${connState}${meta ? ` • ${meta.width}×${meta.height}` : ''}`}
      </div>
      <button
        type="button"
        className="absolute bottom-2 right-2 z-10 text-white bg-black/40 hover:bg-black/60 rounded px-2 py-1 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={async (e) => {
          e.stopPropagation();
          setError(null);
          setIsAttached(false);
          setMeta(null);
          try { await consumerRef.current?.close(); } catch {}
          consumerRef.current = null;
          const el = videoRef.current;
          if (el) {
            try { (el.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()); } catch {}
            (el as any).srcObject = null;
          }
          // Trigger effect by resetting same producerId via microtask
          setTimeout(() => {
            if (videoRef.current && producerId) {
              (async () => {
                try {
                  const c = new BrowserRecvConsumer();
                  c.onConnectionStateChange((state) => setConnState(state));
                  consumerRef.current = c;
                  await c.attachTo(videoRef.current!, producerId);
                  setIsAttached(true);
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


