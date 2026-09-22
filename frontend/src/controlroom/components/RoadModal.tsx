import React from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { X, Road as RoadIcon } from 'lucide-react';

export const RoadModal: React.FC = () => {
  const { selectedRoadId, roads, junctions, selectRoad, unblockRoad } = useSimulationStore();
  const road = selectedRoadId ? roads[selectedRoadId] : null;
  if (!road) return null;

  const fromJ = junctions[road.from];
  const toJ = junctions[road.to];

  const congColor = road.congestionLevel >= 0.7 ? 'var(--neon-red)'
    : road.congestionLevel >= 0.4 ? 'var(--neon-orange)' : 'var(--neon-green)';

  return (
    <div className="modal-backdrop" onClick={() => selectRoad(null)}>
      <div
        className="glass-panel rounded-xl p-5 w-[420px] fade-in"
        style={{ border: '1px solid var(--border-bright)', boxShadow: '0 0 40px rgba(56,189,248,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold" style={{ color: 'var(--neon-blue)' }}>
                Road Segment
              </h2>
              <span className="badge" style={{
                borderColor: road.isBlocked ? 'var(--neon-red)' : congColor,
                color: road.isBlocked ? 'var(--neon-red)' : congColor,
                background: 'transparent',
              }}>
                {road.isBlocked ? '🚫 BLOCKED' : road.status}
              </span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {fromJ?.name ?? road.from} → {toJ?.name ?? road.to}
            </div>
            <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-dim)' }}>
              ID: {road.id}
            </div>
          </div>
          <button onClick={() => selectRoad(null)} className="btn btn-ghost" style={{ padding: '4px' }}>
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="metric-card space-y-2">
            <div className="text-xs font-bold" style={{ color: 'var(--text-dim)' }}>ROAD PROPERTIES</div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-dim)' }}>Distance</span>
              <span style={{ color: 'var(--neon-blue)' }}>{road.distance} km</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-dim)' }}>Lanes</span>
              <span style={{ color: 'var(--neon-blue)' }}>{road.lanes}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-dim)' }}>Capacity</span>
              <span style={{ color: 'var(--neon-blue)' }}>{road.capacity} veh</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-dim)' }}>Bidirectional</span>
              <span style={{ color: road.bidirectional ? 'var(--neon-green)' : 'var(--neon-orange)' }}>
                {road.bidirectional ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          <div className="metric-card space-y-2">
            <div className="text-xs font-bold" style={{ color: 'var(--text-dim)' }}>LIVE TRAFFIC</div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-dim)' }}>Vehicle Count</span>
              <span style={{ color: 'var(--neon-cyan)' }}>{road.vehicleCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-dim)' }}>Avg Speed</span>
              <span style={{ color: 'var(--neon-blue)' }}>{road.averageSpeed.toFixed(0)} km/h</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-dim)' }}>Travel Time</span>
              <span style={{ color: 'var(--neon-yellow)' }}>{road.travelTime.toFixed(1)} min</span>
            </div>
          </div>
        </div>

        {/* Congestion bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-dim)' }}>Congestion Level</span>
            <span style={{ color: congColor }}>{Math.round(road.congestionLevel * 100)}%</span>
          </div>
          <div className="congestion-bar" style={{ height: 8 }}>
            <div style={{
              width: `${road.congestionLevel * 100}%`, height: '100%',
              background: road.congestionLevel >= 0.7
                ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                : road.congestionLevel >= 0.4
                ? 'linear-gradient(90deg, #f97316, #eab308)'
                : 'linear-gradient(90deg, #22c55e, #4ade80)',
              transition: 'width 0.3s',
              borderRadius: 4,
            }} />
          </div>
        </div>

        {/* Algorithm cost */}
        <div className="metric-card mt-4">
          <div className="text-xs font-bold mb-2" style={{ color: 'var(--neon-purple)' }}>
            ALGORITHMIC EDGE COST
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-dim)' }}>Raw Distance Cost</span>
            <span style={{ color: 'var(--text-secondary)' }}>{road.distance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-dim)' }}>Traffic Penalty (×{(1 + road.congestionLevel * 3).toFixed(2)})</span>
            <span style={{ color: 'var(--neon-orange)' }}>+{(road.distance * road.congestionLevel * 3).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs font-bold border-t mt-1 pt-1"
            style={{ borderColor: 'var(--border-dim)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total Dijkstra Cost</span>
            <span style={{ color: road.isBlocked ? 'var(--neon-red)' : 'var(--neon-purple)' }}>
              {road.isBlocked ? '∞ (BLOCKED)' : road.trafficCost.toFixed(3)}
            </span>
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>
            Formula: distance × (1 + congestion × 3)
          </div>
        </div>

        {/* Unblock button */}
        {road.isBlocked && (
          <button
            onClick={() => { unblockRoad(road.id); selectRoad(null); }}
            className="btn btn-success w-full mt-4"
          >
            🔓 UNBLOCK ROAD
          </button>
        )}
      </div>
    </div>
  );
};
