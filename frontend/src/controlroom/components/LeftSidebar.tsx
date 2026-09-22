import React, { useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import type { ScenarioType } from '../types';
import {
  AlertTriangle, Ambulance, Lock, RotateCcw,
  Sliders, ChevronDown, Gauge, BarChart2, Zap
} from 'lucide-react';

const SCENARIO_OPTIONS: { id: ScenarioType; label: string; color: string }[] = [
  { id: 'NORMAL',          label: 'Normal Traffic',      color: 'var(--neon-green)' },
  { id: 'RUSH_HOUR',       label: 'Rush Hour',           color: 'var(--neon-yellow)' },
  { id: 'MAJOR_CONGESTION',label: 'Major Congestion',    color: 'var(--neon-orange)' },
  { id: 'ROAD_ACCIDENT',   label: 'Road Accident',       color: 'var(--neon-red)' },
  { id: 'EMERGENCY',       label: 'Emergency Vehicle',   color: 'var(--neon-pink)' },
  { id: 'NETWORK_OVERLOAD',label: 'Network Overload',    color: 'var(--neon-purple)' },
];

export const LeftSidebar: React.FC<{ width?: number }> = ({ width = 220 }) => {
  const {
    settings, setScenario, setTrafficDensity, setSpawnRate, setCongestionSeverity,
    createCongestion, blockRoad, spawnAmbulance, resetScenario,
    setSimulationMode, runComparison, start, selectedJunctionId, selectedRoadId,
  } = useSimulationStore();

  const [scenarioOpen, setScenarioOpen] = useState(false);

  const handleScenario = (id: ScenarioType) => {
    setScenario(id);
    setScenarioOpen(false);
    start();
  };

  const currentScenario = SCENARIO_OPTIONS.find(s => s.id === settings.scenario);

  return (
    <aside className="glass-panel flex flex-col overflow-y-auto flex-shrink-0"
      style={{ width, minWidth: 180, maxWidth: 380, borderRight: '1px solid var(--border-dim)' }}>

      {/* SCENARIOS */}
      <div className="section-header flex items-center gap-2">
        <Sliders size={9} /> SCENARIO CONTROLS
      </div>

      <div className="p-2 space-y-2">
        {/* Scenario dropdown */}
        <div className="relative">
          <button
            onClick={() => setScenarioOpen(v => !v)}
            className="w-full btn btn-ghost justify-between"
            style={{ borderColor: currentScenario?.color, color: currentScenario?.color }}
          >
            <span>{currentScenario?.label ?? 'Select Scenario'}</span>
            <ChevronDown size={11} />
          </button>
          {scenarioOpen && (
            <div className="absolute z-50 w-full mt-1 rounded-lg overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)' }}>
              {SCENARIO_OPTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleScenario(s.id)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
                  style={{ color: settings.scenario === s.id ? s.color : 'var(--text-primary)' }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Traffic Density */}
        <div>
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            <span>Traffic Density</span>
            <span style={{ color: 'var(--neon-blue)' }}>{Math.round(settings.trafficDensity * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.05}
            value={settings.trafficDensity}
            onChange={e => setTrafficDensity(parseFloat(e.target.value))}
          />
        </div>

        {/* Vehicle Spawn Rate */}
        <div>
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            <span>Vehicle Spawn Rate</span>
            <span style={{ color: 'var(--neon-blue)' }}>{Math.round(settings.spawnRate * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.05}
            value={settings.spawnRate}
            onChange={e => setSpawnRate(parseFloat(e.target.value))}
          />
        </div>

        {/* Congestion Severity */}
        <div>
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            <span>Congestion Severity</span>
            <span style={{ color: 'var(--neon-orange)' }}>{Math.round(settings.congestionSeverity * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.05}
            value={settings.congestionSeverity}
            onChange={e => setCongestionSeverity(parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="section-header flex items-center gap-2 mt-1">
        <Zap size={9} /> MANUAL CONTROLS
      </div>

      <div className="p-2 space-y-1.5">
        <button
          onClick={() => createCongestion(selectedJunctionId ?? undefined)}
          className="btn btn-warning w-full"
        >
          <Gauge size={11} />
          CREATE CONGESTION
        </button>

        <button
          onClick={() => blockRoad(selectedRoadId ?? undefined)}
          className="btn btn-danger w-full"
        >
          <Lock size={11} />
          BLOCK ROAD
        </button>

        <button
          onClick={spawnAmbulance}
          className="btn w-full"
          style={{ background: 'rgba(248,113,113,0.15)', borderColor: '#f87171', color: '#f87171' }}
        >
          <Ambulance size={11} />
          SPAWN AMBULANCE
        </button>

        <button
          onClick={resetScenario}
          className="btn btn-ghost w-full"
        >
          <RotateCcw size={11} />
          RESET SCENARIO
        </button>
      </div>

      {/* COMPARISON MODE */}
      <div className="section-header flex items-center gap-2 mt-1">
        <BarChart2 size={9} /> COMPARISON MODE
      </div>

      <div className="p-2 space-y-1.5">
        <div className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
          Run both modes to compare performance metrics
        </div>

        <button
          onClick={() => { setSimulationMode('STATIC_BASELINE'); start(); }}
          className={`btn w-full ${settings.simulationMode === 'STATIC_BASELINE' ? 'btn-active' : 'btn-ghost'}`}
        >
          <AlertTriangle size={11} />
          RUN STATIC BASELINE
        </button>

        <button
          onClick={() => { setSimulationMode('MA_TRSN'); start(); }}
          className={`btn w-full ${settings.simulationMode === 'MA_TRSN' ? 'btn-active' : 'btn-success'}`}
        >
          <Zap size={11} />
          RUN MA-TRSN
        </button>
      </div>

      {/* Mode indicator */}
      <div className="p-2 mt-auto">
        <div className="metric-card text-center">
          <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>ACTIVE MODE</div>
          <div className="font-bold text-sm" style={{
            color: settings.simulationMode === 'MA_TRSN' ? 'var(--neon-green)' : 'var(--neon-orange)'
          }}>
            {settings.simulationMode === 'MA_TRSN' ? '⚡ MA-TRSN' : '⏱ STATIC BASELINE'}
          </div>
        </div>
      </div>
    </aside>
  );
};
