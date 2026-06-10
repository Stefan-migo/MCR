'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import StreamPreview from '../../../components/dashboard/StreamPreview';

export default function ViewerByProducerPage() {
  const params = useParams<{ producerId: string }>();
  const producerId = params?.producerId;
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });

  useEffect(() => {
    // Attempt to resize the window close to video dimensions after first paint
    try {
      const padW = 16; // window chrome approximation
      const padH = 64;
      window.resizeTo(dimensions.w + padW, dimensions.h + padH);
    } catch {}
  }, [dimensions.w, dimensions.h]);

  return (
    <div
      ref={videoContainerRef}
      style={{ backgroundColor: '#000', width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}
    >
      <button
        onClick={() => window.close()}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: 14,
        }}
        aria-label="Close window"
        title="Close"
      >
        ×
      </button>

      {/* Full-bleed preview; StreamPreview is already wired to consume by producerId */}
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {producerId ? (
          <StreamPreview
            producerId={producerId}
            mirrored={false}
            objectFit="contain"
            fillMode="fitHeight"
            onDimensions={(d) => setDimensions({ w: d.width, h: d.height })}
          />
        ) : null}
      </div>
    </div>
  );
}


