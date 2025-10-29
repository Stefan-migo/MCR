'use client';

import { useState, useEffect } from 'react';

interface DebugLog {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: any;
}

interface DebugLoggerProps {
  maxLogs?: number;
  showTimestamp?: boolean;
}

export default function DebugLogger({ maxLogs = 20, showTimestamp = true }: DebugLoggerProps) {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  // Add log function
  const addLog = (level: DebugLog['level'], message: string, details?: any) => {
    const newLog: DebugLog = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      details
    };

    setLogs(prev => {
      const updated = [newLog, ...prev];
      return updated.slice(0, maxLogs);
    });
  };

  // Expose addLog globally for easy access
  useEffect(() => {
    (window as any).debugLogger = { addLog };
    return () => {
      delete (window as any).debugLogger;
    };
  }, []);

  const getLevelColor = (level: DebugLog['level']) => {
    switch (level) {
      case 'info': return 'text-blue-600';
      case 'warn': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      case 'success': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const getLevelIcon = (level: DebugLog['level']) => {
    switch (level) {
      case 'info': return 'ℹ️';
      case 'warn': return '⚠️';
      case 'error': return '❌';
      case 'success': return '✅';
      default: return '📝';
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="bg-black/90 backdrop-blur-sm rounded-lg border border-gray-600 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-600">
          <div className="flex items-center space-x-2">
            <span className="text-white font-semibold">🔍 Debug Logger</span>
            <span className="text-xs text-gray-400">({logs.length} logs)</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Logs */}
        {isExpanded && (
          <div className="max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-gray-400">
                No debug logs yet...
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start space-x-2 p-2 rounded hover:bg-gray-800/50 transition-colors"
                  >
                    <span className="text-sm">{getLevelIcon(log.level)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs font-medium ${getLevelColor(log.level)}`}>
                          {log.message}
                        </span>
                        {showTimestamp && (
                          <span className="text-xs text-gray-500">
                            {log.timestamp}
                          </span>
                        )}
                      </div>
                      {log.details && (
                        <div className="mt-1 text-xs text-gray-400 font-mono">
                          {typeof log.details === 'string' 
                            ? log.details 
                            : JSON.stringify(log.details, null, 2)
                          }
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-2 border-t border-gray-600">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setLogs([])}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Clear Logs
            </button>
            <div className="text-xs text-gray-500">
              Tap to expand/collapse
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
