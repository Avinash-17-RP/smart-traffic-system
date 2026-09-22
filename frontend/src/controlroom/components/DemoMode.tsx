import React, { useEffect, useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { X, Zap, ArrowRight, Play, Info } from 'lucide-react';

interface DemoPhaseConfig {
  phase: number;
  title: string;
  duration: number; // ticks
  setup: (store: any) => void;
  whatHappened: string;
  why: string;
  algorithm: string;
  actionTaken: string;
}

const DEMO_SEQUENCE: DemoPhaseConfig[] = [
  {
    phase: 1,
    title: 'PHASE 1: NORMAL TRAFFIC',
    duration: 30,
    setup: (s) => { s.setScenario('NORMAL'); s.setSpeed(2); s.start(); },
    whatHappened: 'Traffic is flowing smoothly with moderate vehicle density.',
    why: 'Network is below congestion thresholds.',
    algorithm: 'Adaptive Signal Control',
    actionTaken: 'Signals dynamically adjust green time based on local queue lengths at each junction.',
  },
  {
    phase: 2,
    title: 'PHASE 2: CONGESTION DEVELOPS',
    duration: 20,
    setup: (s) => { s.setScenario('MAJOR_CONGESTION'); },
    whatHappened: 'Heavy traffic builds up rapidly at Saibaba Colony junction.',
    why: 'Inflow exceeds intersection capacity, queues lengthen, congestion hits 90%.',
    algorithm: 'Situation Classifier',
    actionTaken: 'Classifier detects congestion event and prepares to switch routing strategy.',
  },
  {
    phase: 3,
    title: 'PHASE 3: DIJKSTRA REROUTES VEHICLES',
    duration: 40,
    setup: (s) => {}, // Continuous
    whatHappened: 'Vehicles approaching the congested area are actively rerouted.',
    why: 'Edge cost for congested roads increased dramatically.',
    algorithm: "Dijkstra's Algorithm",
    actionTaken: 'Recalculated shortest paths using dynamic traffic weights. Vehicles diverted to alternate routes.',
  },
  {
    phase: 4,
    title: 'PHASE 4: TRAFFIC STABILIZES',
    duration: 30,
    setup: (s) => { s.setScenario('NORMAL'); }, // Clear congestion slowly
    whatHappened: 'Congestion at the bottleneck dissipates.',
    why: 'Diverted traffic reduced inflow, allowing adaptive signals to clear the backlog.',
    algorithm: 'Adaptive Signal Control + Dijkstra',
    actionTaken: 'Network returns to nominal state.',
  },
  {
    phase: 5,
    title: 'PHASE 5: AMBULANCE APPEARS',
    duration: 15,
    setup: (s) => { s.spawnAmbulance(); s.setSpeed(1); },
    whatHappened: 'An emergency vehicle is dispatched.',
    why: 'Medical emergency triggered in the simulation.',
    algorithm: 'Situation Classifier',
    actionTaken: 'Elevates network to EMERGENCY state (highest priority).',
  },
  {
    phase: 6,
    title: 'PHASE 6: A* CALCULATES ROUTE',
    duration: 15,
    setup: (s) => {},
    whatHappened: 'Optimal emergency route to KMC Hospital is instantly calculated.',
    why: 'A* uses Euclidean distance heuristic for fast, targeted pathfinding.',
    algorithm: 'A* Search',
    actionTaken: 'Identified fastest path considering physical distance and severe blockages.',
  },
  {
    phase: 7,
    title: 'PHASE 7: GREEN CORRIDOR ACTIVATES',
    duration: 40,
    setup: (s) => {},
    whatHappened: 'Traffic signals along the ambulance route turn green.',
    why: 'To provide uninterrupted passage for the emergency vehicle.',
    algorithm: 'Signal Preemption System',
    actionTaken: 'Locks signals on the calculated A* path to GREEN until the ambulance passes.',
  },
  {
    phase: 8,
    title: 'PHASE 8: AMBULANCE REACHES DESTINATION',
    duration: 20,
    setup: (s) => {},
    whatHappened: 'Ambulance arrives at KMC Hospital.',
    why: 'Journey completed successfully.',
    algorithm: 'Corridor Manager',
    actionTaken: 'Deactivates green corridor. Signals return to normal adaptive operation.',
  },
  {
    phase: 9,
    title: 'PHASE 9: NETWORK OVERLOAD OCCURS',
    duration: 30,
    setup: (s) => { s.setScenario('NETWORK_OVERLOAD'); s.setSpeed(2); },
    whatHappened: 'Simultaneous heavy traffic on multiple major corridors.',
    why: 'City-wide rush hour event triggered.',
    algorithm: 'Situation Classifier',
    actionTaken: 'Detects >60% network saturation. Triggers load balancing.',
  },
  {
    phase: 10,
    title: 'PHASE 10: ACO LOAD BALANCING',
    duration: 60,
    setup: (s) => {},
    whatHappened: 'Traffic is distributed proportionally across multiple paths.',
    why: 'Sending all traffic to a single "shortest" path would just create a new bottleneck.',
    algorithm: 'Ant Colony Optimization (ACO)',
    actionTaken: 'Uses pheromone trails to balance load, shifting percentages of traffic to less congested routes.',
  }
];

export const DemoMode: React.FC = () => {
  const store = useSimulationStore();
  const { demoMode, demoPhase, tick, stopDemo, setDemoPhase } = store;
  const [phaseStartTick, setPhaseStartTick] = useState(0);

  const currentConfig = DEMO_SEQUENCE.find(p => p.phase === demoPhase);

  // Phase transition logic
  useEffect(() => {
    if (!demoMode || !currentConfig) return;

    // Check if phase duration has elapsed
    if (tick - phaseStartTick >= currentConfig.duration) {
      if (demoPhase < DEMO_SEQUENCE.length) {
        // Next phase
        const nextPhase = demoPhase + 1;
        setDemoPhase(nextPhase);
        setPhaseStartTick(tick);
        const nextConfig = DEMO_SEQUENCE.find(p => p.phase === nextPhase);
        if (nextConfig) nextConfig.setup(store);
      } else {
        // End of demo
        stopDemo();
      }
    }
  }, [tick, demoMode, demoPhase, currentConfig, phaseStartTick]);

  // Initial setup when demo starts
  useEffect(() => {
    if (demoMode && demoPhase === 1) {
      setPhaseStartTick(tick);
      DEMO_SEQUENCE[0].setup(store);
    }
  }, [demoMode, demoPhase]);

  if (!demoMode || !currentConfig) return null;

  const progress = Math.min(100, ((tick - phaseStartTick) / currentConfig.duration) * 100);

  return (
    <div className="demo-overlay fade-in">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <Zap size={18} style={{ color: 'var(--neon-purple)' }} />
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '0.1em' }}>
            {currentConfig.title}
          </h2>
        </div>
        <button onClick={stopDemo} className="btn btn-ghost">
          <X size={14} /> EXIT DEMO
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="space-y-3">
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-dim)' }}>WHAT HAPPENED?</div>
            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{currentConfig.whatHappened}</div>
          </div>
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-dim)' }}>WHY?</div>
            <div className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>{currentConfig.why}</div>
          </div>
        </div>

        <div className="space-y-3 p-3 rounded-lg" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)' }}>
          <div>
            <div className="text-xs font-bold mb-1 flex items-center gap-1" style={{ color: 'var(--neon-purple)' }}>
              <Info size={12} /> WHICH ALGORITHM?
            </div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{currentConfig.algorithm}</div>
          </div>
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: 'var(--neon-purple)' }}>WHAT ACTION WAS TAKEN?</div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{currentConfig.actionTaken}</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-dim)' }}>
          <div className="h-full" style={{ width: `${progress}%`, background: 'var(--neon-purple)', transition: 'width 0.2s linear' }} />
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
          {Math.round(currentConfig.duration - (tick - phaseStartTick))}t remaining
        </div>
      </div>

      {/* Manual advance */}
      <div className="flex justify-between items-center mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-dim)' }}>
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Phase {demoPhase} of {DEMO_SEQUENCE.length}
        </div>
        <button
          onClick={() => {
            if (demoPhase < DEMO_SEQUENCE.length) {
              setPhaseStartTick(0); // Force advance next tick
            } else {
              stopDemo();
            }
          }}
          className="btn btn-purple"
        >
          {demoPhase < DEMO_SEQUENCE.length ? (
            <>SKIP TO NEXT PHASE <ArrowRight size={12} /></>
          ) : (
            'FINISH DEMO'
          )}
        </button>
      </div>
    </div>
  );
};
