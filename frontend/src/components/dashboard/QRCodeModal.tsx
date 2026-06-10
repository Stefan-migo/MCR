'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QRCodeModalProps {
  url: string;
  onClose: () => void;
}

export default function QRCodeModal({ url, onClose }: QRCodeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Scan to Connect</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="bg-white rounded-lg p-4 flex justify-center mb-4">
          <QRCodeSVG value={url} size={220} level="M" />
        </div>

        <p className="text-sm text-gray-300 text-center mb-4">
          Open your phone's camera and scan the QR code to connect
        </p>

        <div className="bg-gray-700 rounded-lg p-2 mb-4 text-center">
          <span className="text-xs text-gray-400 break-all">{url}</span>
        </div>

        <button
          onClick={() => navigator.clipboard.writeText(url)}
          className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          📋 Copy URL
        </button>
      </div>
    </div>
  );
}
