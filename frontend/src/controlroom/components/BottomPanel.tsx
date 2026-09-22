import React, { useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import type { LogEntry } from '../types';

const LOG_TYPE_CONFIG = {
  INFO:      { className: 'log-info',      color: 'var(--neon-blue)',   icon: 'ℹ' },
  ALGORITHM: { className: 'log-algorithm', color: 'var(--neon-purple)', icon: '⚙' },
  EMERGENCY: { className: 'log-emergency', color: 'var(--neon-red)',    icon: '🚨' },
  WARNING:   { className: 'log-warning',   color: 'var(--neon-yellow)', icon: '⚠' },
  SUCCESS:   { className: 'log-success',   color: 'var(--neon-green)',  icon: '✓' },
};

const LogRow: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  const config = LOG_TYPE_CONFIG[entry.type];
  return (
    <div className={`flex gap-3 px-3 py-1.5 hover:bg-white/3 transition-colors ${config.className} fade-in`}
      style={{ minHeight: 28 }}>
      <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
        {entry.realTime}
      </span>
      <span className="text-xs flex-shrink-0" style={{ color: config.color }}>{config.icon}</span>
      <span className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {entry.message}
      </span>
    </div>
  );
};

export const BottomPanel: React.FC<{ height?: number }> = ({ height = 190 }) => {
  const { eventLog } = useSimulationStore();
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<LogEntry['type'] | 'ALL'>('ALL');

  const filtered = filter === 'ALL' ? eventLog : eventLog.filter(e => e.type === filter);

  if (collapsed) {
    return (
      <div
        className="glass-panel flex items-center justify-between px-4 h-8 cursor-pointer flex-shrink-0"
        style={{ borderTop: '1px solid var(--border-dim)' }}
        onClick={() => setCollapsed(false)}
      >
        <div className="flex items-center gap-2">
          <Terminal size={10} style={{ color: 'var(--neon-blue)' }} />
          <span className="text-xs" style={{ color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
            ALGORITHM & EVENT LOG
          </span>
          <span className="badge badge-info">{eventLog.length} entries</span>
        </div>
        <ChevronUp size={14} style={{ color: 'var(--text-dim)' }} />
      </div>
    );
  }

  return (
    <div className="glass-panel flex flex-col flex-shrink-0"
      style={{ height, minHeight: 90, maxHeight: 420, borderTop: '1px solid var(--border-dim)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-dim)' }}>
        <div className="flex items-center gap-2">
          <Terminal size={10} style={{ color: 'var(--neon-blue)' }} />
          <span className="text-xs font-bold" style={{ color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
            ALGORITHM & EVENT LOG
          </span>
          <span className="badge badge-info">{eventLog.length} entries</span>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {(['ALL', 'INFO', 'ALGORITHM', 'EMERGENCY', 'WARNING', 'SUCCESS'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`btn btn-ghost ${filter === type ? 'btn-active' : ''}`}
              style={{ padding: '2px 6px', fontSize: '9px' }}
            >
              {type}
            </button>
          ))}
        </div>

        <button onClick={() => setCollapsed(true)} className="btn btn-ghost" style={{ padding: '2px 6px' }}>
          <ChevronDown size={12} />
        </button>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-4 text-xs" style={{ color: 'var(--text-dim)' }}>
            No log entries yet. Start the simulation to see events.
          </div>
        ) : (
          filtered.map(entry => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
};
