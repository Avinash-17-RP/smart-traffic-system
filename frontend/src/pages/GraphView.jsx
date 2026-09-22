import { useState } from 'react';
import { Network, Zap, ShieldAlert, Split, Compass, MapPin, Clock, Route, Gauge, Hospital, X } from 'lucide-react';
import { CoimbatoreMap } from '../components/CoimbatoreMap';

export default function GraphView() {
  const [selectedJunction, setSelectedJunction] = useState(null);
  const [selectedAlgo, setSelectedAlgo] = useState('shortest');
  const [routeSummary, setRouteSummary] = useState(null);

  const algoColor = (algo) =>
    algo === 'emergency' ? 'red' : algo === 'loadbalance' ? 'amber' : 'cyan';

  return (
    <div className="graph-view">

      {/* ── Compact Header ── */}
      <div className="gv-header">
        <div className="gv-header-left">
          <Network className="gv-header-icon" size={20} />
          <div>
            <h2 className="gv-title">Coimbatore District Graph</h2>
            <p className="gv-subtitle">Click map to set Start → Destination</p>
          </div>
        </div>

        {/* Algorithm Selector */}
        <div className="gv-algo-selector">
          {[
            { key: 'shortest',    icon: <Zap size={13} />,         label: 'Dijkstra',      color: 'cyan' },
            { key: 'emergency',   icon: <ShieldAlert size={13} />,  label: 'Emergency A*',  color: 'red' },
            { key: 'loadbalance', icon: <Split size={13} />,        label: 'Load Balance',  color: 'amber' },
          ].map(a => (
            <button
              key={a.key}
              onClick={() => setSelectedAlgo(a.key)}
              className={`gv-algo-btn ${selectedAlgo === a.key ? `gv-algo-btn--active gv-algo-btn--${a.color}` : ''}`}
            >
              {a.icon}<span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Map (full width) ── */}
      <div className="gv-map-wrapper">
        <CoimbatoreMap
          height="calc(100vh - 220px)"
          selectedAlgorithm={selectedAlgo}
          onRouteCalculated={setRouteSummary}
          onSelectJunction={setSelectedJunction}
        />

        {/* Junction Inspector — floating overlay */}
        {selectedJunction && (
          <div className="gv-junction-overlay">
            <div className="gv-junction-header">
              <span className="gv-junction-name">{selectedJunction.name}</span>
              <button className="gv-junction-close" onClick={() => setSelectedJunction(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="gv-junction-body">
              <div className="gv-junction-row">
                <span className="gv-junction-label">Coords</span>
                <span className="gv-junction-value mono">{selectedJunction.lat?.toFixed(4)}, {selectedJunction.lon?.toFixed(4)}</span>
              </div>
              <div className="gv-junction-row">
                <span className="gv-junction-label">Signal</span>
                <span className="gv-junction-badge gv-junction-badge--green">ADAPTIVE AI</span>
              </div>
              {selectedJunction.isHospital && (
                <div className="gv-junction-row">
                  <span className="gv-junction-label">Type</span>
                  <span className="gv-junction-badge gv-junction-badge--red">🏥 HOSPITAL</span>
                </div>
              )}
              <div className="gv-junction-id">
                <span className="mono">{selectedJunction.id}</span>
              </div>
            </div>
          </div>
        )}

        {/* Empty state hint */}
        {!selectedJunction && !routeSummary && (
          <div className="gv-hint-overlay">
            <Compass size={18} />
            <span>Click any junction to inspect</span>
          </div>
        )}
      </div>

      {/* ── Route Summary — compact horizontal bar ── */}
      {routeSummary && (
        <div className={`gv-route-bar gv-route-bar--${algoColor(routeSummary.algorithm)}`}>
          {/* Route endpoints */}
          <div className="gv-route-endpoints">
            <span className="gv-route-dot gv-route-dot--start"><MapPin size={12} /></span>
            <span className="gv-route-point">{routeSummary.startJunction.name.replace('Junction ','J-')}</span>
            <span className={`gv-route-arrow gv-route-arrow--${algoColor(routeSummary.algorithm)}`}>→</span>
            <span className="gv-route-dot gv-route-dot--end"><MapPin size={12} /></span>
            <span className="gv-route-point">{routeSummary.endJunction.name.replace('Junction ','J-')}</span>
          </div>

          {/* Inline stats */}
          <div className="gv-route-stats">
            <div className="gv-route-stat">
              <Clock size={13} />
              <span className="gv-route-stat-value">{routeSummary.etaMinutes}<small>min</small></span>
            </div>
            <div className="gv-route-stat-divider" />
            <div className="gv-route-stat">
              <Route size={13} />
              <span className="gv-route-stat-value">{routeSummary.distanceKm}<small>km</small></span>
            </div>
            <div className="gv-route-stat-divider" />
            <div className="gv-route-stat">
              <Gauge size={13} />
              <span className={`gv-route-stat-value ${
                (routeSummary.avgCongestion ?? 0) > 60 ? 'gv-stat--red' :
                (routeSummary.avgCongestion ?? 0) > 30 ? 'gv-stat--amber' : 'gv-stat--green'
              }`}>{routeSummary.avgCongestion ?? 0}<small>%</small></span>
            </div>
          </div>

          {/* Algorithm badge */}
          <span className={`gv-route-algo-badge gv-route-algo-badge--${algoColor(routeSummary.algorithm)}`}>
            {routeSummary.algorithm === 'shortest' ? 'Dijkstra' : routeSummary.algorithm === 'emergency' ? 'Emergency A*' : 'Load Balance'}
          </span>

          {/* Nearest Hospital — only for emergency */}
          {routeSummary.algorithm === 'emergency' && routeSummary.nearestHospital && (
            <div className="gv-route-hospital">
              <Hospital size={14} />
              <span>{routeSummary.nearestHospital.name}</span>
              <strong>{routeSummary.nearestHospital.distKm} km</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
