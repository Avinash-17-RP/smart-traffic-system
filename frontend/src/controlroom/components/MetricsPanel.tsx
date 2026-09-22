import React, { useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell
} from 'recharts';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
      borderRadius: 6, padding: '6px 10px', fontSize: 10,
    }}>
      <div style={{ color: 'var(--text-dim)' }}>Tick: {label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
};

export const MetricsPanel: React.FC<{ height?: number }> = ({ height = 200 }) => {
  const { metricsHistory, comparisonData, settings } = useSimulationStore();
  const [visible, setVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'realtime' | 'comparison'>('realtime');

  const chartData = metricsHistory.slice(-40).map(m => ({
    tick: m.tick,
    travelTime: m.avgTravelTime,
    waitTime: m.avgWaitTime,
    congestion: m.congestedJunctions,
    utilization: m.avgRoadUtilization,
    active: m.activeVehicles,
  }));

  // Comparison bar chart
  const staticLast = comparisonData.staticBaseline.slice(-1)[0];
  const maLast = comparisonData.maTraffic.slice(-1)[0];
  const compData = [
    { metric: 'Avg Travel', static: staticLast?.avgTravelTime ?? 0, ma: maLast?.avgTravelTime ?? 0 },
    { metric: 'Avg Wait', static: staticLast?.avgWaitTime ?? 0, ma: maLast?.avgWaitTime ?? 0 },
    { metric: 'Cong. Jcts', static: staticLast?.congestedJunctions ?? 0, ma: maLast?.congestedJunctions ?? 0 },
    { metric: 'Util %', static: staticLast?.avgRoadUtilization ?? 0, ma: maLast?.avgRoadUtilization ?? 0 },
  ];

  if (!visible) {
    return (
      <div
        className="glass-panel flex items-center justify-between px-3 py-1.5 cursor-pointer flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-dim)' }}
        onClick={() => setVisible(true)}
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={10} style={{ color: 'var(--neon-blue)' }} />
          <span className="text-xs" style={{ color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
            SIMULATION METRICS
          </span>
        </div>
        <ChevronDown size={12} style={{ color: 'var(--text-dim)' }} />
      </div>
    );
  }

  return (
    <div className="glass-panel flex-shrink-0" style={{ height, minHeight: 120, maxHeight: 320, borderBottom: '1px solid var(--border-dim)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: 'var(--border-dim)' }}>
        <div className="flex items-center gap-2">
          <BarChart2 size={10} style={{ color: 'var(--neon-blue)' }} />
          <span className="text-xs font-bold" style={{ color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
            SIMULATION METRICS
          </span>
          <span className="badge badge-info">SIMULATION RESULTS — NOT REAL DATA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {(['realtime', 'comparison'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`btn btn-ghost ${activeTab === tab ? 'btn-active' : ''}`}
                style={{ padding: '2px 8px', fontSize: '9px' }}>
                {tab === 'realtime' ? 'REAL-TIME' : 'COMPARISON'}
              </button>
            ))}
          </div>
          <button onClick={() => setVisible(false)} className="btn btn-ghost" style={{ padding: '2px 4px' }}>
            <ChevronUp size={12} />
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100%-32px)]">
        {activeTab === 'realtime' ? (
          <>
            {/* Travel & Wait Time */}
            <div className="flex-1 px-2 py-1">
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Avg Travel & Wait Time (ticks)</div>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,80,140,0.15)" />
                  <XAxis dataKey="tick" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
                  <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="travelTime" name="Travel" stroke="var(--neon-blue)" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="waitTime" name="Wait" stroke="var(--neon-yellow)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Congested junctions */}
            <div className="flex-1 px-2 py-1">
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Congested Junctions</div>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,80,140,0.15)" />
                  <XAxis dataKey="tick" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
                  <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="congestion" name="Congested" stroke="var(--neon-red)" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="active" name="Active Vehicles" stroke="var(--neon-cyan)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Road utilization */}
            <div className="flex-1 px-2 py-1">
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Road Utilization %</div>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,80,140,0.15)" />
                  <XAxis dataKey="tick" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
                  <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="utilization" name="Util%" stroke="var(--neon-purple)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          /* Comparison chart */
          <div className="flex-1 px-4 py-2">
            <div className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
              Static Baseline vs MA-TRSN — SIMULATION RESULTS
            </div>
            {compData.every(d => d.static === 0 && d.ma === 0) ? (
              <div className="text-center py-8 text-xs" style={{ color: 'var(--text-dim)' }}>
                Run both "STATIC BASELINE" and "MA-TRSN" modes to see comparison data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="80%">
                <BarChart data={compData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,80,140,0.15)" />
                  <XAxis type="number" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
                  <YAxis dataKey="metric" type="category" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Bar dataKey="static" name="Static Baseline" fill="#f97316" opacity={0.8} />
                  <Bar dataKey="ma" name="MA-TRSN" fill="#38bdf8" opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
