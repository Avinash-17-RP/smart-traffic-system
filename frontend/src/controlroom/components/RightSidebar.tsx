import React from 'react';
import { useSimulationStore } from '../store/simulationStore';
import {
  Car, AlertTriangle, Ambulance, Navigation,
  Clock, TrendingUp, Shuffle, Zap, Activity
} from 'lucide-react';

function StatRow({ label, value, unit = '', color = 'var(--neon-blue)' }: {
  label: string; value: string | number; unit?: string; color?: string;
}) {
  return (
    <div className="flex justify-between items-center py-1.5"
      style={{ borderBottom: '1px solid rgba(30,80,140,0.15)' }}>
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-xs font-bold font-mono" style={{ color }}>
        {value}{unit}
      </span>
    </div>
  );
}

function CongestionBar({ level }: { level: number }) {
  let fillClass = 'congestion-fill-low';
  if (level >= 0.85) fillClass = 'congestion-fill-max';
  else if (level >= 0.65) fillClass = 'congestion-fill-high';
  else if (level >= 0.40) fillClass = 'congestion-fill-medium';
  return (
    <div className="congestion-bar mt-1">
      <div className={fillClass} style={{ width: `${level * 100}%`, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export const RightSidebar: React.FC<{ width?: number }> = ({ width = 240 }) => {
  const {
    metrics, mode, activeAlgorithm, selectedJunctionId,
    junctions, roads, vehicles, acoDistribution, settings,
    greenCorridorJunctions
  } = useSimulationStore();

  const selectedJunction = selectedJunctionId ? junctions[selectedJunctionId] : null;

  const algoColor = {
    ADAPTIVE_SIGNAL: 'var(--neon-green)',
    DIJKSTRA: 'var(--neon-blue)',
    ASTAR: 'var(--neon-red)',
    ACO: 'var(--neon-purple)',
  };

  const algoName = {
    ADAPTIVE_SIGNAL: 'Adaptive Signal Control',
    DIJKSTRA: "Dijkstra's Algorithm",
    ASTAR: 'A* Search',
    ACO: 'Ant Colony Optimization',
  };

  const activeVehicleList = Object.values(vehicles).filter(v => v.state !== 'COMPLETED');
  const ambulanceCount = activeVehicleList.filter(v => v.type === 'AMBULANCE').length;
  const blockedCount = Object.values(roads).filter(r => r.isBlocked).length;

  return (
    <aside className="glass-panel flex flex-col overflow-y-auto flex-shrink-0"
      style={{ width, minWidth: 200, maxWidth: 380, borderLeft: '1px solid var(--border-dim)' }}>

      {/* LIVE SYSTEM STATUS */}
      <div className="section-header flex items-center gap-2">
        <Activity size={9} /> LIVE SYSTEM STATUS
      </div>
      <div className="px-3 py-2 space-y-0">
        <StatRow label="Active Vehicles" value={metrics.activeVehicles} color="var(--neon-blue)" />
        <StatRow label="Congested Junctions" value={metrics.congestedJunctions}
          color={metrics.congestedJunctions > 3 ? 'var(--neon-red)' : 'var(--neon-yellow)'} />
        <StatRow label="Blocked Roads" value={blockedCount}
          color={blockedCount > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} />
        <StatRow label="Emergency Vehicles" value={ambulanceCount}
          color={ambulanceCount > 0 ? 'var(--neon-red)' : 'var(--text-dim)'} />
        <StatRow label="Avg Travel Time" value={metrics.avgTravelTime.toFixed(1)} unit=" ticks" />
        <StatRow label="Avg Wait Time" value={metrics.avgWaitTime.toFixed(1)} unit=" ticks" />
        <StatRow label="Vehicles Rerouted" value={metrics.vehiclesRerouted} color="var(--neon-cyan)" />
        <StatRow label="Green Corridors" value={greenCorridorJunctions.length > 0 ? 1 : 0}
          color={greenCorridorJunctions.length > 0 ? 'var(--neon-green)' : 'var(--text-dim)'} />
        <StatRow label="Vehicles Completed" value={metrics.vehiclesCompleted} color="var(--neon-green)" />
        <StatRow label="Road Utilization" value={metrics.avgRoadUtilization} unit="%" />
        {metrics.emergencyResponseTime > 0 && (
          <StatRow label="Emergency Response" value={metrics.emergencyResponseTime} unit=" ticks"
            color="var(--neon-red)" />
        )}
      </div>

      {/* ACTIVE ALGORITHM */}
      <div className="section-header flex items-center gap-2 mt-1">
        <Zap size={9} /> ACTIVE ALGORITHM
      </div>
      <div className="p-3">
        {activeAlgorithm ? (
          <div className="metric-card space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Algorithm</span>
              <span className="font-bold text-xs" style={{ color: algoColor[activeAlgorithm.algorithm] }}>
                {algoName[activeAlgorithm.algorithm]}
              </span>
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {activeAlgorithm.reason}
            </div>
            {activeAlgorithm.routesRecalculated !== undefined && (
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Routes recalculated</span>
                <span className="text-xs font-bold" style={{ color: 'var(--neon-cyan)' }}>
                  {activeAlgorithm.routesRecalculated}
                </span>
              </div>
            )}
            {activeAlgorithm.path && (
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Route</div>
                <div className="text-xs font-mono" style={{ color: 'var(--neon-green)', lineHeight: 1.6 }}>
                  {activeAlgorithm.path.join(' → ')}
                </div>
              </div>
            )}
            {activeAlgorithm.travelTime !== undefined && (
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Est. Travel Time</span>
                <span className="text-xs font-bold" style={{ color: 'var(--neon-yellow)' }}>
                  {activeAlgorithm.travelTime.toFixed(1)} min
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full blink"
                style={{ background: algoColor[activeAlgorithm.algorithm] }} />
              <span className="text-xs font-bold" style={{ color: algoColor[activeAlgorithm.algorithm] }}>
                RUNNING
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-center py-4" style={{ color: 'var(--text-dim)' }}>
            Start simulation to activate
          </div>
        )}
      </div>

      {/* ACO DISTRIBUTION */}
      {acoDistribution.length > 0 && (
        <>
          <div className="section-header flex items-center gap-2">
            <Shuffle size={9} /> ACO LOAD DISTRIBUTION
          </div>
          <div className="p-3 space-y-2">
            {acoDistribution.slice(0, 4).map(d => (
              <div key={d.routeId} className="text-xs">
                <div className="flex justify-between mb-1">
                  <span style={{ color: 'var(--text-secondary)' }}>{d.routeId}</span>
                  <span style={{ color: 'var(--text-dim)' }}>
                    <span style={{ color: 'var(--neon-orange)' }}>{d.beforeLoad}%</span>
                    {' → '}
                    <span style={{ color: 'var(--neon-green)' }}>{d.afterLoad}%</span>
                  </span>
                </div>
                <div className="congestion-bar">
                  <div style={{
                    width: `${d.afterLoad}%`, height: '100%',
                    background: 'linear-gradient(90deg, #6366f1, #a78bfa)',
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* JUNCTION STATUS */}
      <div className="section-header flex items-center gap-2 mt-1">
        <Navigation size={9} /> JUNCTION STATUS
      </div>
      <div className="p-3">
        {selectedJunction ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-xs" style={{ color: 'var(--neon-blue)' }}>
                {selectedJunction.name}
              </span>
              {selectedJunction.isHospital && (
                <span className="badge badge-info">HOSPITAL</span>
              )}
            </div>

            {/* Signal */}
            <div className="metric-card">
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Signal</span>
                <span className="font-bold text-xs" style={{
                  color: selectedJunction.signalPhase === 'GREEN' ? 'var(--neon-green)' :
                    selectedJunction.signalPhase === 'RED' ? 'var(--neon-red)' : 'var(--neon-yellow)'
                }}>
                  {selectedJunction.signalPhase}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Timer</span>
                <span className="text-xs font-mono" style={{ color: 'var(--neon-cyan)' }}>
                  {selectedJunction.signalTimer}s
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Green dir.</span>
                <span className="text-xs font-mono" style={{ color: 'var(--neon-blue)' }}>
                  {selectedJunction.currentGreenDirection}
                </span>
              </div>
            </div>

            {/* Queues */}
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>QUEUE LENGTHS</div>
            <div className="grid grid-cols-2 gap-1">
              {(['North', 'South', 'East', 'West'] as const).map(dir => {
                const key = `queue${dir}` as keyof typeof selectedJunction;
                const val = selectedJunction[key] as number;
                return (
                  <div key={dir} className="metric-card text-center">
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{dir[0]}</div>
                    <div className="font-bold text-lg" style={{
                      color: val > 10 ? 'var(--neon-red)' : val > 5 ? 'var(--neon-orange)' : 'var(--neon-green)'
                    }}>
                      {val}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Congestion */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'var(--text-dim)' }}>Congestion</span>
                <span style={{ color: 'var(--neon-orange)' }}>
                  {Math.round(selectedJunction.congestionLevel * 100)}%
                </span>
              </div>
              <CongestionBar level={selectedJunction.congestionLevel} />
            </div>

            {/* Adaptive timing */}
            {settings.simulationMode === 'MA_TRSN' && (
              <div className="metric-card">
                <div className="text-xs mb-1 font-bold" style={{ color: 'var(--neon-green)' }}>
                  ADAPTIVE SIGNAL DECISION
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-dim)' }}>N/S Green</span>
                  <span style={{ color: 'var(--neon-green)' }}>
                    {selectedJunction.adaptiveGreenNS}s
                    <span style={{ color: 'var(--text-dim)' }}> (fixed: 30s)</span>
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-dim)' }}>E/W Green</span>
                  <span style={{ color: 'var(--neon-green)' }}>
                    {selectedJunction.adaptiveGreenEW}s
                    <span style={{ color: 'var(--text-dim)' }}> (fixed: 30s)</span>
                  </span>
                </div>
              </div>
            )}

            {selectedJunction.isGreenCorridor && (
              <div className="badge badge-normal w-full justify-center">
                🟢 GREEN CORRIDOR ACTIVE
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6" style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
            Click a junction on the map to inspect it
          </div>
        )}
      </div>
    </aside>
  );
};
