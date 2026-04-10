import React from 'react';
import type { LogEntry } from './types';

interface LogDrawerProps {
    logs: LogEntry[];
    logsEndRef: React.RefObject<HTMLDivElement>;
}

export default function LogDrawer({ logs, logsEndRef }: LogDrawerProps) {
    return (
        <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs overflow-y-auto max-h-[160px]">
            {logs.length === 0 ? (
                <div className="text-gray-500 text-center mt-10">
                    Henüz işlem yapılmadı. Başlamak için butona tıklayın.
                </div>
            ) : (
                logs.map((log, index) => (
                    <div
                        key={index}
                        className="mb-1 border-l-2 pl-2"
                        style={{
                            borderColor:
                                log.type === 'error'
                                    ? '#ef4444'
                                    : log.type === 'success'
                                      ? '#22c55e'
                                      : log.type === 'process'
                                        ? '#fbbf24'
                                        : '#60a5fa',
                        }}
                    >
                        <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                        <span
                            className={
                                log.type === 'error'
                                    ? 'text-red-400'
                                    : log.type === 'success'
                                      ? 'text-green-400'
                                      : log.type === 'process'
                                        ? 'text-yellow-400'
                                        : 'text-blue-400'
                            }
                        >
                            {log.message}
                        </span>
                    </div>
                ))
            )}
            <div ref={logsEndRef} />
        </div>
    );
}
