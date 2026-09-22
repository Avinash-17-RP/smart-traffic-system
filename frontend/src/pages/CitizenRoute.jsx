import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Zap, ShieldAlert, Split, Radio, ArrowRight,
  Compass, Sparkles, MapPin, Clock, Route, Ambulance,
  Network, Brain, Signal, Car, Hospital, ChevronRight,
  Mouse, Navigation, Shield
} from 'lucide-react';
import { CoimbatoreMap } from '../components/CoimbatoreMap';
import { socket } from '../App';

// Animated counter hook
function useCounter(target, duration = 1800) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    let start = 0;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) ref.current = requestAnimationFrame(step);
    };
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration]);
  return count;
}

export default function CitizenRoute() {
  const [liveStats, setLiveStats] = useState({ vehicles: 1420, hotspots: 3, avgWait: 18 });
  const [routeSummary, setRouteSummary] = useState(null);
  const [selectedAlgo, setSelectedAlgo] = useState('shortest');
  const navigate = useNavigate();

  const vehicleCount = useCounter(liveStats.vehicles, 2000);
  const junctionCount = useCounter(84000, 2500);
  const roadCount = useCounter(120, 2000);

  useEffect(() => {
    socket.on('dashboard:update', (data) => {
      setLiveStats({
        vehicles: data.vehiclesSimulated || 1420,
        hotspots: data.activeHotspots || 3,
        avgWait: data.avgCityWaitTime || 18,
      });
    });
    return () => socket.off('dashboard:update');
  }, []);

  return (
    <div className="landing-page">

      {/* ═══════════ HERO ═══════════ */}
      <section className="lp-hero">
        <div className="lp-hero-glow" />
        <div className="lp-hero-content">
          <div className="lp-hero-badge">
            <Radio size={11} className="lp-pulse" />
            <span>LIVE COIMBATORE METROPOLITAN GRID</span>
          </div>

          <h1 className="lp-hero-title">
            <span className="lp-hero-title-main">VELOCITA 360</span>
            <span className="lp-hero-title-sub">Smart Traffic Congestion System</span>
          </h1>

          <p className="lp-hero-desc">
            Real-time adaptive traffic intelligence powered by Dijkstra & A* pathfinding 
            over an 84,000-node OSM road graph covering the Coimbatore district.
          </p>

          <div className="lp-hero-actions">
            <button className="lp-btn-primary" onClick={() => navigate('/graph')}>
              <Activity size={16} /> Open Live Graph
              <ChevronRight size={14} />
            </button>
            <button className="lp-btn-secondary" onClick={() => {
              document.getElementById('lp-map-section')?.scrollIntoView({ behavior: 'smooth' });
            }}>
              <Mouse size={14} /> Try Route Finder
            </button>
          </div>
        </div>

        {/* Animated Stats Strip */}
        <div className="lp-stats-strip">
          {[
            { icon: <Network size={16} />, value: junctionCount.toLocaleString() + '+', label: 'OSM Nodes', color: '#22d3ee' },
            { icon: <Route size={16} />,   value: roadCount.toLocaleString() + 'k',   label: 'Road Segments', color: '#34d399' },
            { icon: <Car size={16} />,     value: vehicleCount.toLocaleString(),       label: 'Active Vehicles', color: '#a78bfa' },
            { icon: <Signal size={16} />,  value: liveStats.avgWait + 's',             label: 'Avg Signal Wait', color: '#fbbf24' },
            { icon: <Hospital size={16} />,value: '8',                                 label: 'Hospital Nodes', color: '#f87171' },
          ].map(s => (
            <div key={s.label} className="lp-stat-card">
              <div className="lp-stat-icon" style={{ color: s.color }}>{s.icon}</div>
              <div className="lp-stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="lp-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section className="lp-features">
        <div className="lp-section-header">
          <span className="lp-section-tag"><Brain size={12} /> CORE ALGORITHMS</span>
          <h2 className="lp-section-title">Three Routing Engines</h2>
          <p className="lp-section-desc">Each algorithm is optimized for different real-world scenarios</p>
        </div>

        <div className="lp-feature-grid">
          {[
            {
              icon: <Zap size={22} />,
              title: 'Dijkstra',
              subtitle: 'Shortest Path',
              desc: 'Classic shortest-path with 3× congestion penalty. Explores all directions equally to guarantee the optimal route for everyday commuting.',
              color: '#22d3ee',
              bg: 'rgba(34, 211, 238, 0.08)',
              border: 'rgba(34, 211, 238, 0.2)',
              tag: 'CIVILIAN',
            },
            {
              icon: <ShieldAlert size={22} />,
              title: 'Emergency A*',
              subtitle: 'Hospital Priority',
              desc: '10× congestion penalty with lane preference and hospital bias. Uses haversine heuristic to guide search toward goal — ambulances get there faster.',
              color: '#ef4444',
              bg: 'rgba(239, 68, 68, 0.08)',
              border: 'rgba(239, 68, 68, 0.2)',
              tag: 'AMBULANCE',
            },
            {
              icon: <Split size={22} />,
              title: 'Load Balance',
              subtitle: 'Traffic Distribution',
              desc: 'Distributes vehicles across alternate routes to prevent bottlenecks. Ideal for peak-hour traffic management across the district.',
              color: '#f59e0b',
              bg: 'rgba(245, 158, 11, 0.08)',
              border: 'rgba(245, 158, 11, 0.2)',
              tag: 'TRAFFIC OPS',
            },
          ].map(f => (
            <div key={f.title} className="lp-feature-card" style={{ background: f.bg, borderColor: f.border }}>
              <div className="lp-feature-icon" style={{ color: f.color }}>{f.icon}</div>
              <div className="lp-feature-tag" style={{ color: f.color, background: f.bg }}>{f.tag}</div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-subtitle" style={{ color: f.color }}>{f.subtitle}</p>
              <p className="lp-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="lp-how">
        <div className="lp-section-header">
          <span className="lp-section-tag"><Compass size={12} /> HOW IT WORKS</span>
          <h2 className="lp-section-title">Route in 3 Steps</h2>
        </div>

        <div className="lp-steps">
          {[
            { num: '01', icon: <MapPin size={20} />, title: 'Pick Start', desc: 'Click any junction on the map or use GPS to set your starting point', color: '#ef4444' },
            { num: '02', icon: <Navigation size={20} />, title: 'Pick Destination', desc: 'Click a second point — or hit 🚑 for nearest hospital routing', color: '#22d3ee' },
            { num: '03', icon: <Route size={20} />, title: 'See the Route', desc: 'The algorithm calculates the optimal path with ETA, distance & congestion', color: '#34d399' },
          ].map((step, i) => (
            <div key={step.num} className="lp-step">
              <div className="lp-step-num" style={{ color: step.color }}>{step.num}</div>
              <div className="lp-step-icon" style={{ color: step.color }}>{step.icon}</div>
              <h4 className="lp-step-title">{step.title}</h4>
              <p className="lp-step-desc">{step.desc}</p>
              {i < 2 && <div className="lp-step-arrow"><ChevronRight size={18} /></div>}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ INTERACTIVE MAP ═══════════ */}
      <section className="lp-map-section" id="lp-map-section">
        <div className="lp-section-header">
          <span className="lp-section-tag"><Sparkles size={12} /> INTERACTIVE MAP</span>
          <h2 className="lp-section-title">Try It — Click Any Two Points</h2>
          <p className="lp-section-desc">Real Coimbatore OSM data with 84k nodes, 120k road segments, and live signal simulation</p>
        </div>

        <div className="lp-map-wrapper">
          <CoimbatoreMap
            height="580px"
            selectedAlgorithm={selectedAlgo}
            onRouteCalculated={setRouteSummary}
          />
        </div>

        {/* Route result */}
        {routeSummary && (
          <div className="lp-route-result">
            <div className="lp-route-left">
              <div className="lp-route-label">
                <Sparkles size={14} /> 
                {routeSummary.algorithm === 'shortest' ? 'DIJKSTRA' : routeSummary.algorithm === 'emergency' ? 'EMERGENCY A*' : 'LOAD BALANCE'} ROUTE
              </div>
              <div className="lp-route-path">
                <span className="lp-route-start"><MapPin size={13} /> {routeSummary.startJunction.name.replace('Junction ','')}</span>
                <ArrowRight size={16} className="lp-route-arrow" />
                <span className="lp-route-end"><MapPin size={13} /> {routeSummary.endJunction.name.replace('Junction ','')}</span>
              </div>
            </div>
            <div className="lp-route-metrics">
              <div className="lp-route-metric">
                <Clock size={15} />
                <span className="lp-route-metric-val">{routeSummary.etaMinutes}<small>min</small></span>
              </div>
              <div className="lp-route-metric-div" />
              <div className="lp-route-metric">
                <Route size={15} />
                <span className="lp-route-metric-val">{routeSummary.distanceKm}<small>km</small></span>
              </div>
              <div className="lp-route-metric-div" />
              <div className="lp-route-metric">
                <Network size={15} />
                <span className="lp-route-metric-val">{routeSummary.pathJunctions.length}<small>nodes</small></span>
              </div>
            </div>
            <button className="lp-btn-primary lp-btn-sm" onClick={() => navigate('/graph')}>
              <Activity size={14} /> Full Graph View <ChevronRight size={13} />
            </button>
          </div>
        )}
      </section>

      {/* ═══════════ EMERGENCY CTA ═══════════ */}
      <section className="lp-emergency-cta">
        <div className="lp-emergency-content">
          <Ambulance size={28} className="lp-emergency-icon" />
          <div>
            <h3 className="lp-emergency-title">Emergency Ambulance Routing</h3>
            <p className="lp-emergency-desc">
              Click any start point on the map, then hit the 🚑 button to instantly find the fastest route to the nearest hospital — with 10× congestion avoidance and lane preference.
            </p>
          </div>
          <button className="lp-btn-emergency" onClick={() => navigate('/graph')}>
            <Shield size={15} /> Try Emergency Route
          </button>
        </div>
      </section>

      {/* ═══════════ FOOTER STRIP ═══════════ */}
      <footer className="lp-footer">
        <div className="lp-footer-left">
          <Activity size={14} className="lp-footer-logo" />
          <span className="lp-footer-brand">VELOCITA 360</span>
          <span className="lp-footer-sep">·</span>
          <span>Smart Traffic Congestion System — Coimbatore District</span>
        </div>
        <div className="lp-footer-right">
          <span>Computer Networks Project</span>
          <span className="lp-footer-sep">·</span>
          <span>OSM + Dijkstra + A*</span>
        </div>
      </footer>
    </div>
  );
}
