import React, { useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { X, Navigation2, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

export const JunctionModal: React.FC = () => {
  const { selectedJunctionId, junctions, roads, vehicles, metricsHistory, settings, selectJunction } = useSimulationStore();
  const junction = selectedJunctionId ? junctions[selectedJunctionId] : null;
  if (!junction) return null;

  // Connected roads
  const connectedRoads = Object.values(roads).filter(
    r => r.from === junction.id || r.to === junction.id
  );

  // Mini traffic history (last 20 data points)
  const chartData = metricsHistory.slice(-20).map((m, i) => ({
    t: i,
    queue: m.totalQueueLength,
    wait: m.avgWaitTime,
  }));

  // Vehicles at this junction
  const vehAtJunction = Object.values(vehicles).filter(
    v => v.currentJunction === junction.id && v.state !== 'COMPLETED'
  );

  const signalColor = {
    GREEN: 'var(--neon-green)', RED: 'var(--neon-red)', YELLOW: 'var(--neon-yellow)'
  }[junction.signalPhase];

  return (
    <div className="modal-backdrop" onClick={() => selectJunction(null)}>
      <div
        className="glass-panel rounded-xl p-5 w-[600px] max-h-[80vh] overflow-y-auto fade-in"
        style={{ border: '1px solid var(--border-bright)', boxShadow: '0 0 40px rgba(56,189,248,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Navigation2 size={14} style={{ color: 'var(--neon-blue)' }} />
              <h2 className="text-base font-bold" style={{ color: 'var(--neon-blue)' }}>
                {junction.name}
              </h2>
              {junction.isHospital && <span className="badge badge-info">+ HOSPITAL</span>}
              {junction.isGreenCorridor && (
                <span className="badge badge-normal">🟢 GREEN CORRIDOR</span>
              )}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              Junction ID: {junction.id} | Position: ({junction.x}, {junction.y}) — Simulated Coordinates
            </div>
          </div>
          <button onClick={() => selectJunction(null)} className="btn btn-ghost" style={{ padding: '4px' }}>
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Signal Status */}
          <div className="metric-card">
            <div className="text-xs mb-2 font-bold" style={{ color: 'var(--text-dim)' }}>SIGNAL STATUS</div>
            <div className="text-center">
              <div className="w-8 h-8 rounded-full mx-auto mb-2"
                style={{ background: signalColor, boxShadow: `0 0 12px ${signalColor}` }} />
              <div className="font-bold text-sm" style={{ color: signalColor }}>{junction.signalPhase}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                {junction.signalTimer}s remaining
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Green dir: <span style={{ color: 'var(--neon-blue)' }}>{junction.currentGreenDirection}</span>
              </div>
            </div>
          </div>

          {/* Queue lengths */}
          <div className="metric-card">
            <div className="text-xs mb-2 font-bold" style={{ color: 'var(--text-dim)' }}>QUEUE LENGTHS</div>
            <div className="space-y-1">
              {[
                { dir: 'North ↑', val: junction.queueNorth },
                { dir: 'South ↓', val: junction.queueSouth },
                { dir: 'East →',  val: junction.queueEast },
                { dir: 'West ←',  val: junction.queueWest },
              ].map(({ dir, val }) => (
                <div key={dir} className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{dir}</span>
                  <span className="font-bold text-xs font-mono"
                    style={{ color: val > 10 ? 'var(--neon-red)' : val > 5 ? 'var(--neon-orange)' : 'var(--neon-green)' }}>
                    {val} veh
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Traffic metrics */}
          <div className="metric-card">
            <div className="text-xs mb-2 font-bold" style={{ color: 'var(--text-dim)' }}>TRAFFIC METRICS</div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-dim)' }}>Congestion</span>
                <span style={{ color: 'var(--neon-orange)' }}>{Math.round(junction.congestionLevel * 100)}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-dim)' }}>Waiting</span>
                <span style={{ color: 'var(--neon-yellow)' }}>{junction.vehiclesWaiting}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-dim)' }}>Passing</span>
                <span style={{ color: 'var(--neon-green)' }}>{junction.vehiclesPassing}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Adaptive Signal Decision */}
        {settings.simulationMode === 'MA_TRSN' && (
          <div className="metric-card mt-4">
            <div className="text-xs font-bold mb-2" style={{ color: 'var(--neon-green)' }}>
              ⚡ ADAPTIVE SIGNAL CONTROL DECISION
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <div style={{ color: 'var(--text-dim)' }}>N/S Adaptive Green</div>
                <div className="font-bold text-lg" style={{ color: 'var(--neon-green)' }}>
                  {junction.adaptiveGreenNS}s
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-dim)' }}>E/W Adaptive Green</div>
                <div className="font-bold text-lg" style={{ color: 'var(--neon-green)' }}>
                  {junction.adaptiveGreenEW}s
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-dim)' }}>Static Baseline</div>
                <div className="font-bold text-lg" style={{ color: 'var(--neon-orange)' }}>
                  {junction.fixedGreen}s
                </div>
              </div>
            </div>
            <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
              Adaptive allocation based on live queue counts:
              N/S total = {junction.queueNorth + junction.queueSouth} ·
              E/W total = {junction.queueEast + junction.queueWest}
            </div>
          </div>
        )}

        {/* Connected roads */}
        <div className="mt-4">
          <div className="text-xs font-bold mb-2" style={{ color: 'var(--text-dim)' }}>
            CONNECTED ROADS ({connectedRoads.length})
          </div>
          <div className="grid grid-cols-2 gap-2">
            {connectedRoads.map(road => {
              const otherEnd = road.from === junction.id ? road.to : road.from;
              const other = junctions[otherEnd];
              return (
                <div key={road.id} className="metric-card text-xs">
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      → {other?.shortName ?? otherEnd}
                    </span>
                    <span className="badge" style={{
                      borderColor: road.isBlocked ? 'var(--neon-red)' :
                        road.congestionLevel > 0.6 ? 'var(--neon-orange)' : 'var(--neon-green)',
                      color: road.isBlocked ? 'var(--neon-red)' :
                        road.congestionLevel > 0.6 ? 'var(--neon-orange)' : 'var(--neon-green)',
                      background: 'transparent',
                    }}>
                      {road.isBlocked ? 'BLOCKED' : road.status}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-dim)' }}>
                    {road.distance} km · {Math.round(road.congestionLevel * 100)}% congested
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mini chart */}
        {chartData.length > 2 && (
          <div className="mt-4">
            <div className="text-xs font-bold mb-2 flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
              <TrendingUp size={10} /> NETWORK QUEUE TREND (last 20 snapshots)
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,80,140,0.2)" />
                <XAxis dataKey="t" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', fontSize: 10 }}
                  labelStyle={{ color: 'var(--text-dim)' }}
                />
                <Line type="monotone" dataKey="queue" stroke="var(--neon-blue)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
