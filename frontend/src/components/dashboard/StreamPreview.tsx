'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserRecvConsumer } from '../../lib/webrtc-consumer';

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
  const consumerRef = useRef<BrowserRecvConsumer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAttached, setIsAttached] = useState<boolean>(false);
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(null);

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
                const updateMeta = () => {
                  const dims = { width: el.videoWidth || 0, height: el.videoHeight || 0 };
                  setMeta(dims);
                  try { onDimensions?.(dims); } catch {}
                };
                el.onloadedmetadata = updateMeta;
                (el as any).onresize = updateMeta;
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


