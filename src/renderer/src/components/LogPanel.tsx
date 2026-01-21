import React from 'react'
import { LogEntry } from '../types'

interface LogPanelProps {
  logs: LogEntry[]
}

export function LogPanel({ logs }: LogPanelProps) {
  return (
    <div className="log-panel">
      <h3>Activity Log</h3>
      <div className="log-entries">
        {logs.length === 0 ? (
          <div className="log-entry info">No activity yet</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`log-entry ${log.type}`}>
              <span className="log-time">
                {log.timestamp.toLocaleTimeString()}
              </span>
              <span className="log-message">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
