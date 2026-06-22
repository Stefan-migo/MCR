'use client';

import { useState, useEffect, useCallback } from 'react';
import { ControlModalProps } from '../../types/dashboard';
import StreamPreview from './StreamPreview';
import StreamControls from './StreamControls';

export default function StreamModal({
  stream,
  isOpen,
  onClose,
  onDisconnect,
  onRename,
  onNdiToggle,
  ndiState,
  cameraState,
  onCameraLensSelect,
  onCameraZoomChange,
  onForceVp8,
}: ControlModalProps) {
  const [ndiEnabled, setNdiEnabled] = useState(ndiState?.enabled ?? false);
  const [ndiName, setNdiName] = useState(ndiState?.ndiSourceName || '');

  // Sync local state when ndiState changes
  useEffect(() => {
    if (ndiState) {
      setNdiEnabled(ndiState.enabled);
      if (ndiState.ndiSourceName) {
        setNdiName(ndiState.ndiSourceName);
      }
    }
  }, [ndiState?.enabled, ndiState?.ndiSourceName]);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  const handleNdiToggle = () => {
    const newEnabled = !ndiEnabled;
    setNdiEnabled(newEnabled);
    onNdiToggle((stream as any).deviceId, newEnabled, undefined);
  };

  const handleNdiNameBlur = () => {
    if (ndiEnabled) {
      onNdiToggle((stream as any).deviceId, true, ndiName || undefined);
    }
  };

  const handleOpenPopup = () => {
    const width = Math.max(320, stream.resolution?.width || 1280);
    const height = Math.max(240, stream.resolution?.height || 720);
    window.open(
      `/viewer/${stream.producerId}`,
      `viewer-${stream.producerId}`,
      `popup=yes,width=${width},height=${height}`
    );
  };

  // Camera control state
  const deviceId = (stream as any).deviceId as string | undefined;
  const cs = cameraState; // already per-device from the caller
  const hasZoom = cs && cs.lenses.some(l => l.zoomMax !== null && l.zoomMin !== null);
  const activeZoomMax = cs?.lenses.find(l => l.deviceId === cs.activeLens)?.zoomMax ?? null;
  const activeZoomMin = cs?.lenses.find(l => l.deviceId === cs.activeLens)?.zoomMin ?? null;
  const activeZoomStep = cs?.lenses.find(l => l.deviceId === cs.activeLens)?.zoomStep ?? null;

  const handleLensChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!deviceId || !onCameraLensSelect) return;
    onCameraLensSelect(deviceId, e.target.value);
  };

  const handleZoomCommit = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    if (!deviceId || !onCameraZoomChange) return;
    const zoom = parseFloat((e.target as HTMLInputElement).value);
    onCameraZoomChange(deviceId, zoom);
  };

  if (!isOpen) return null;

  // Group lenses by facingMode for the picker
  const envLenses = cs?.lenses.filter(l => l.facingMode === 'environment') || [];
  const userLenses = cs?.lenses.filter(l => l.facingMode === 'user') || [];
  const otherLenses = cs?.lenses.filter(l => l.facingMode !== 'environment' && l.facingMode !== 'user') || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl max-w-2xl w-full mx-4 shadow-2xl border border-gray-700 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {stream.customName || stream.deviceName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Video Preview */}
        <div className="aspect-video bg-gray-900">
          <StreamPreview producerId={stream.producerId} mirrored={false} />
        </div>

        {/* Stream Controls (reuse existing) */}
        <div className="p-4">
          <StreamControls
            stream={stream}
            onDisconnect={onDisconnect}
            onRename={onRename}
          />
        </div>

        {/* Camera Section — only when cameraInfo is available */}
        {cs && (
          <div className="px-4 pb-4 border-t border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-white mb-3">Camera</h3>
            <div className="space-y-3">
              {/* Lens picker dropdown grouped by facingMode */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Active Lens
                </label>
                <select
                  value={cs.activeLens || ''}
                  onChange={handleLensChange}
                  className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  {envLenses.length > 0 && (
                    <optgroup label="Back Camera">
                      {envLenses.map(l => (
                        <option key={l.deviceId} value={l.deviceId}>
                          {l.label} ({l.lensType})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {userLenses.length > 0 && (
                    <optgroup label="Front Camera">
                      {userLenses.map(l => (
                        <option key={l.deviceId} value={l.deviceId}>
                          {l.label} ({l.lensType})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherLenses.length > 0 && (
                    <optgroup label="Other">
                      {otherLenses.map(l => (
                        <option key={l.deviceId} value={l.deviceId}>
                          {l.label} ({l.lensType})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Zoom slider — only when zoom is available */}
              {hasZoom && activeZoomMax !== null && activeZoomMin !== null && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Zoom: {cs.zoom?.toFixed(1) ?? '1.0'}x
                  </label>
                  <input
                    type="range"
                    min={activeZoomMin}
                    max={activeZoomMax}
                    step={activeZoomStep ?? 0.1}
                    defaultValue={cs.zoom ?? activeZoomMin}
                    onMouseUp={handleZoomCommit}
                    onTouchEnd={handleZoomCommit}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{activeZoomMin}x</span>
                    <span>{activeZoomMax}x</span>
                  </div>
                </div>
              )}

              {/* Read-only state when single lens without zoom */}
              {!hasZoom && cs.lenses.length <= 1 && (
                <p className="text-sm text-gray-400">
                  {cs.lenses[0]?.label || 'Camera'} — no zoom control
                </p>
              )}
            </div>
          </div>
        )}

        {/* NDI Controls */}
        <div className="px-4 pb-4 border-t border-gray-700 pt-4">
          <h3 className="text-sm font-semibold text-white mb-3">NDI Output</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">NDI Source</span>
              <span className="text-sm text-white font-mono">
                {ndiState?.ndiSourceName ||
                  'MCR-' + ((stream as any).deviceId?.slice(0, 8) || 'N/A')}
              </span>
            </div>

            {/* NDI name input — shown when enabled */}
            {ndiEnabled && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Custom NDI Name
                </label>
                <input
                  type="text"
                  value={ndiName}
                  onChange={(e) => setNdiName(e.target.value)}
                  onBlur={handleNdiNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNdiNameBlur();
                  }}
                  placeholder="NDI source name..."
                  className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {/* NDI Toggle */}
            <button
              onClick={handleNdiToggle}
              disabled={ndiState?.loading}
              className={`w-full px-3 py-2 text-sm rounded transition-colors disabled:opacity-50 ${
                ndiEnabled
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {ndiState?.loading
                ? 'Processing...'
                : ndiEnabled
                  ? 'NDI Active'
                  : 'NDI Off'}
            </button>

            {/* Open in Popup */}
            <button
              onClick={handleOpenPopup}
              className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              Open in Popup
            </button>
          </div>
        </div>

        {/* Troubleshooting */}
        {(stream as any).deviceId && (
          <div className="px-4 pb-4 border-t border-gray-700 pt-4">
            <details className="group">
              <summary className="text-sm font-semibold text-gray-400 cursor-pointer hover:text-white transition-colors">
                Troubleshooting
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-500">
                  ¿Video negro o congelado? Forzar VP8 puede solucionar problemas con encoders H.264 defectuosos en algunos dispositivos Android.
                </p>
                <button
                  onClick={() => {
                    const deviceId = (stream as any).deviceId;
                    if (deviceId && onForceVp8) {
                      onForceVp8(deviceId);
                      alert('Forzando VP8. El teléfono se recargará automáticamente.');
                    }
                  }}
                  className="w-full px-3 py-2 bg-yellow-700 text-white text-sm rounded hover:bg-yellow-600 transition-colors"
                >
                  ⚠ Forzar VP8
                </button>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
