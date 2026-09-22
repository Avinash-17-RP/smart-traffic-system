import React from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { Play, Pause, RotateCcw, Zap, Radio, AlertTriangle, Shield, Activity } from 'lucide-react';

const MODE_CONFIG = {
  NORMAL: {
    label: 'NORMAL TRAFFIC',
    badgeClass: 'badge-normal',
    icon: <Activity size={10} />,
    algo: 'Adaptive Signal Control',
  },
  CONGESTION: {
    label: 'CONGESTION',
    badgeClass: 'badge-congestion',
    icon: <AlertTriangle size={10} />,
    algo: "Dijkstra's Algorithm",
  },
  EMERGENCY: {
    label: 'EMERGENCY',
    badgeClass: 'badge-emergency',
    icon: <Shield size={10} />,
    algo: 'A* Search',
  },
  NETWORK_OVERLOAD: {
    label: 'NETWORK OVERLOAD',
    badgeClass: 'badge-overload',
    icon: <Zap size={10} />,
    algo: 'Ant Colony Optimization',
  },
};

const SPEEDS = [0.5, 1, 2, 4];

export const TopBar: React.FC = () => {
  const { isRunning, mode, settings, tick, simTimeSeconds, start, pause, reset, setSpeed, startDemo, demoMode, stopDemo } = useSimulationStore();

  const modeConfig = MODE_CONFIG[mode];

  const simTime = new Date(simTimeSeconds * 1000).toISOString().substr(11, 8);

  return (
    <header className="glass-panel flex items-center justify-between px-4 h-14 flex-shrink-0 border-b"
      style={{ borderColor: 'var(--border-dim)' }}>

      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', boxShadow: '0 0 16px rgba(14,165,233,0.5)' }}>
            <Radio size={16} color="white" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-widest" style={{ color: 'var(--neon-blue)', letterSpacing: '0.2em' }}>
              MA-TRSN
            </div>
            <div className="text-xs" style={{ color: 'var(--text-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>
              SMART TRAFFIC CONTROL & ROUTING SIMULATOR
            </div>
          </div>
        </div>

        {/* Simulation tag */}
        <div className="badge badge-info ml-2">⚡ SIMULATION</div>
        <div className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Coimbatore Road Network — Simulated Data
        </div>
      </div>

      {/* Center: Status + Mode */}
      <div className="flex items-center gap-6">
        {/* Online status */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full blink" style={{ background: 'var(--neon-green)', boxShadow: '0 0 6px var(--neon-green)' }} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>SIMULATION ONLINE</span>
        </div>

        {/* Current mode */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>MODE:</span>
          <span className={`badge ${modeConfig.badgeClass}`}>
            {modeConfig.icon}
            {modeConfig.label}
          </span>
        </div>

        {/* Active algorithm */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>ALGO:</span>
          <span className="text-xs font-bold" style={{ color: 'var(--neon-purple)', fontFamily: 'var(--font-mono)' }}>
            {modeConfig.algo}
          </span>
        </div>

        {/* Sim time */}
        <div className="text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          SIM: {simTime} | TICK: {tick}
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {/* Demo mode */}
        <button
          onClick={demoMode ? stopDemo : startDemo}
          className={`btn ${demoMode ? 'btn-danger' : 'btn-purple'}`}
        >
          <Zap size={11} />
          {demoMode ? 'STOP DEMO' : '▶ RUN FULL DEMO'}
        </button>

        <div className="w-px h-6" style={{ background: 'var(--border-dim)' }} />

        {/* Speed selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>SPEED:</span>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`btn btn-ghost ${settings.speed === s ? 'btn-active' : ''}`}
              style={{ padding: '4px 8px', minWidth: 'unset' }}
            >
              {s}×
            </button>
          ))}
        </div>

        <div className="w-px h-6" style={{ background: 'var(--border-dim)' }} />

        {/* Simulation controls */}
        {!isRunning ? (
          <button onClick={start} className="btn btn-success">
            <Play size={11} />
            START
          </button>
        ) : (
          <button onClick={pause} className="btn btn-warning">
            <Pause size={11} />
            PAUSE
          </button>
        )}
        <button onClick={reset} className="btn btn-ghost">
          <RotateCcw size={11} />
          RESET
        </button>
      </div>
    </header>
  );
};
