// ============================================================
// ZUSTAND SIMULATION STORE
// Central state management for all simulation data.
// ============================================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  SimulationState, Vehicle, Junction, Road,
  AlgorithmResult, LogEntry, ScenarioType, MetricsSnapshot
} from '../types';
import { INITIAL_JUNCTIONS, INITIAL_ROADS, JUNCTION_IDS, HOSPITAL_IDS, INTERSECTION_IDS, getRoadBetween } from '../data/network';
import { DESTINATION_BY_ID } from '../data/destinations';
import {
  spawnVehicle, tickVehicle, updateTrafficMetricsBulk, computeMetrics, rerouteVehicles,
  createLogEntry, nextVehicleId
} from '../simulation/engine';
import { tickSignal, computeAdaptiveSignal } from '../algorithms/adaptiveSignal';
import { classifySituation } from '../algorithms/situationClassifier';
import { dijkstra } from '../algorithms/dijkstra';
import { astar } from '../algorithms/astar';
import { runACO, getHighTrafficODPairs } from '../algorithms/aco';
import { SCENARIOS, applyScenario } from '../scenarios';

const CLASSIFIER_INTERVAL = 5;  // ticks between classifications
const MAX_LOG_ENTRIES = 200;
const MAX_METRICS_HISTORY = 120;
const MAX_VEHICLES = 150;

// ---- Initial blank state ----
function initialState(): SimulationState {
  return {
    isRunning: false,
    tick: 0,
    simTimeSeconds: 8 * 3600, // start at 08:00:00

    junctions: { ...INITIAL_JUNCTIONS },
    roads: { ...INITIAL_ROADS },
    vehicles: {},

    mode: 'NORMAL',
    activeAlgorithm: null,
    lastAlgorithmRun: -999,

    activeEmergencyVehicleId: null,
    greenCorridorJunctions: [],
    greenCorridorRoads: [],

    selectedJunctionId: null,
    selectedRoadId: null,

    blockRoadMode: false,
    blockRoadFirstJunctionId: null,

    metrics: {
      tick: 0,
      avgTravelTime: 0,
      avgWaitTime: 0,
      vehiclesCompleted: 0,
      vehiclesRerouted: 0,
      congestedJunctions: 0,
      totalQueueLength: 0,
      activeVehicles: 0,
      blockedRoads: 0,
      emergencyResponseTime: 0,
      avgRoadUtilization: 0,
    },
    metricsHistory: [],
    comparisonData: { staticBaseline: [], maTraffic: [] },
    acoDistribution: [],

    eventLog: [],

    settings: {
      spawnRate: 0.3,
      trafficDensity: 0.35,
      congestionSeverity: 0.25,
      speed: 1,
      scenario: 'NORMAL',
      simulationMode: 'MA_TRSN',
    },

    demoMode: false,
    demoPhase: 0,
  };
}

// ---- Store Actions Interface ----
interface StoreActions {
  start: () => void;
  pause: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  setScenario: (scenario: ScenarioType) => void;
  runTick: () => void;

  selectJunction: (id: string | null) => void;
  selectRoad: (id: string | null) => void;

  createCongestion: (junctionId?: string) => void;
  blockRoad: (roadId?: string) => void;
  unblockRoad: (roadId: string) => void;
  unblockAllRoads: () => void;
  setBlockRoadMode: (active: boolean) => void;
  setBlockRoadFirstJunctionId: (id: string | null) => void;
  blockRoadBetweenJunctions: (junctionAId: string, junctionBId: string) => boolean;
  spawnAmbulance: () => void;
  resetScenario: () => void;

  setSimulationMode: (mode: 'MA_TRSN' | 'STATIC_BASELINE') => void;
  runComparison: () => void;

  startDemo: () => void;
  stopDemo: () => void;
  setDemoPhase: (phase: number) => void;

  addLog: (type: LogEntry['type'], message: string) => void;

  setTrafficDensity: (value: number) => void;
  setSpawnRate: (value: number) => void;
  setCongestionSeverity: (value: number) => void;
}

// ---- Completed vehicles pool ----
let completedVehiclePool: Vehicle[] = [];
let emergencyStartTick = 0;
let scenarioRequestToken = 0;

function routeRoadIds(path: string[], roads: Record<string, Road>): string[] {
  const ids: string[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const road = getRoadBetween(roads, path[i], path[i + 1]);
    if (road) ids.push(road.id);
  }
  return ids;
}

function restoreRoadStatus(road: Road): Road['status'] {
  if (road.isBlocked) return 'BLOCKED';
  if (road.congestionLevel >= 0.7) return 'CONGESTED';
  if (road.congestionLevel >= 0.4) return 'MODERATE';
  return 'CLEAR';
}

function applyEmergencyCorridor(state: SimulationState, path: string[]) {
  // Remove the previous corridor first so a reroute does not leave stale green roads.
  for (const id of state.greenCorridorJunctions) {
    if (state.junctions[id]) state.junctions[id].isGreenCorridor = false;
  }
  for (const id of state.greenCorridorRoads) {
    if (state.roads[id] && !state.roads[id].isBlocked) {
      state.roads[id].status = restoreRoadStatus(state.roads[id]);
    }
  }

  const roadIds = routeRoadIds(path, state.roads);
  state.greenCorridorJunctions = [...path];
  state.greenCorridorRoads = roadIds;

  for (const id of path) {
    if (state.junctions[id]) {
      state.junctions[id].isGreenCorridor = true;
      state.junctions[id].signalPhase = 'GREEN';
      state.junctions[id].signalTimer = 60;
    }
  }
  for (const id of roadIds) {
    if (state.roads[id] && !state.roads[id].isBlocked) state.roads[id].status = 'EMERGENCY_ROUTE';
  }
}

function rerouteActiveAmbulance(state: SimulationState, reason: string): boolean {
  if (!state.activeEmergencyVehicleId) return false;
  const amb = state.vehicles[state.activeEmergencyVehicleId];
  if (!amb || amb.type !== 'AMBULANCE' || amb.state === 'COMPLETED') return false;

  const result = astar(state.junctions, state.roads, amb.currentJunction, amb.destination);
  if (!result.found || result.path.length < 2) {
    const entry = createLogEntry(state.simTimeSeconds, 'WARNING', 'A* could not find an alternate emergency route after the road incident.');
    state.eventLog.unshift(entry);
    return false;
  }

  const oldRoute = amb.route.join('→');
  const newRoute = result.path.join('→');
  if (oldRoute === newRoute && amb.nextJunction === result.path[1]) return false;

  amb.route = result.path;
  amb.nextJunction = result.path[1];
  amb.progress = 0;
  amb.x = state.junctions[amb.currentJunction]?.x ?? amb.x;
  amb.y = state.junctions[amb.currentJunction]?.y ?? amb.y;
  amb.state = 'EMERGENCY';
  amb.rerouted = true;
  amb.rerouteCount += 1;

  applyEmergencyCorridor(state, result.path);
  state.activeAlgorithm = {
    algorithm: 'ASTAR',
    timestamp: state.tick,
    reason,
    path: result.path,
    cost: result.totalCost,
    travelTime: result.estimatedTravelTime,
  };

  const entry = createLogEntry(state.simTimeSeconds, 'EMERGENCY',
    `A* rerouted ambulance around blocked road. New corridor: ${result.path.length} junctions.`);
  state.eventLog.unshift(entry);
  return true;
}

export const useSimulationStore = create<SimulationState & StoreActions>()(
  immer((set, get) => ({
    ...initialState(),

    // ---- Start simulation ----
    start: () => {
      set(state => { state.isRunning = true; });
      get().addLog('INFO', 'Simulation started');
    },

    // ---- Pause simulation ----
    pause: () => {
      set(state => { state.isRunning = false; });
      get().addLog('INFO', 'Simulation paused');
    },

    // ---- Reset simulation ----
    reset: () => {
      completedVehiclePool = [];
      set(() => ({ ...initialState() }));
    },

    setSpeed: (speed) => {
      set(state => { state.settings.speed = speed; });
    },

    setTrafficDensity: (value) => {
      set(state => { state.settings.trafficDensity = value; });
    },

    setSpawnRate: (value) => {
      set(state => { state.settings.spawnRate = value; });
    },

    setCongestionSeverity: (value) => {
      set(state => { state.settings.congestionSeverity = value; });
    },

    // ---- Select scenario ----
    setScenario: (scenario) => {
      const config = SCENARIOS[scenario];
      if (!config) return;
      const token = ++scenarioRequestToken;

      const { junctions, roads } = applyScenario(INITIAL_JUNCTIONS, INITIAL_ROADS, config);
      completedVehiclePool = [];

      // Apply the preset immediately. Vehicle spawning is intentionally batched
      // because the full Coimbatore graph is large and each vehicle computes a
      // real route. This keeps the scenario controls responsive.
      set(state => {
        state.settings.scenario = scenario;
        Object.assign(state.settings, config.settings);
        state.junctions = junctions;
        state.roads = roads;
        state.vehicles = {};
        state.mode = scenario === 'EMERGENCY' ? 'EMERGENCY' : 'NORMAL';
        state.activeAlgorithm = null;
        state.greenCorridorJunctions = [];
        state.greenCorridorRoads = [];
        state.activeEmergencyVehicleId = null;
        state.selectedJunctionId = null;
        state.selectedRoadId = null;
        state.tick = 0;
        state.simTimeSeconds = 8 * 3600;
      });

      const spawnBatch = (remaining: number) => {
        if (token !== scenarioRequestToken || remaining <= 0) return;
        const batch = Math.min(5, remaining);
        for (let i = 0; i < batch; i++) {
          const st = get();
          const v = spawnVehicle(st.junctions, st.roads);
          if (v) set(state => { state.vehicles[v.id] = v; });
        }
        if (token === scenarioRequestToken && remaining > batch) {
          window.setTimeout(() => spawnBatch(remaining - batch), 0);
        } else if (token === scenarioRequestToken) {
          get().addLog('INFO', config.introMessage);
          if (scenario === 'EMERGENCY') {
            window.setTimeout(() => {
              if (token === scenarioRequestToken) get().spawnAmbulance();
            }, 120);
          }
        }
      };

      spawnBatch(Math.min(config.initialVehicleCount, 30));
    },

    // ---- Select junction/road ----
    selectJunction: (id) => set(state => {
      // Deselect old
      if (state.selectedJunctionId) {
        state.junctions[state.selectedJunctionId].isSelected = false;
      }
      state.selectedJunctionId = id;
      if (id && state.junctions[id]) {
        state.junctions[id].isSelected = true;
      }
    }),

    selectRoad: (id) => set(state => {
      state.selectedRoadId = id;
    }),

    // ---- Create congestion ----
    createCongestion: (junctionId) => {
      const st = get();
      const targetPool = Array.from(INTERSECTION_IDS).filter(id => st.junctions[id]);
      const targetId = junctionId ?? targetPool[Math.floor(Math.random() * targetPool.length)];

      set(state => {
        const j = state.junctions[targetId];
        if (!j) return;
        j.congestionLevel = Math.min(1, j.congestionLevel + 0.35);
        j.queueNorth += 12;
        j.queueSouth += 10;
        j.queueEast += 18;
        j.queueWest += 11;
      });

      // Also congest surrounding roads
      set(state => {
        for (const road of Object.values(state.roads)) {
          if (road.from === targetId || road.to === targetId) {
            road.congestionLevel = Math.min(1, road.congestionLevel + 0.30);
            road.vehicleCount = Math.min(road.capacity, road.vehicleCount + 15);
            road.status = 'CONGESTED';
          }
        }
      });

      // Make manual scenario changes immediately actionable instead of waiting
      // for the periodic situation classifier.
      if (get().settings.simulationMode === 'MA_TRSN') {
        set(state => {
          const { updatedVehicles, count } = rerouteVehicles(state.vehicles, state.roads, JUNCTION_IDS);
          for (const [id, update] of Object.entries(updatedVehicles)) {
            if (state.vehicles[id]) Object.assign(state.vehicles[id], update);
          }
          if (count > 0) {
            state.activeAlgorithm = {
              algorithm: 'DIJKSTRA', timestamp: state.tick,
              reason: 'Manual congestion event', routesRecalculated: count,
            };
          }
        });
      }
      get().addLog('WARNING', `Congestion manually created at ${st.junctions[targetId]?.name}`);
    },

    // ---- Block road ----
    blockRoad: (roadId) => {
      const st = get();
      const roads = Object.values(st.roads).filter(r => !r.isBlocked);
      const target = roadId ?? roads[Math.floor(Math.random() * roads.length)]?.id;
      if (!target) return;

      set(state => {
        if (state.roads[target]) {
          state.roads[target].isBlocked = true;
          state.roads[target].status = 'BLOCKED';
          state.roads[target].trafficCost = 999999;
        }

        // If an ambulance is active and the incident touches its current/planned
        // corridor, immediately recalculate A* and rebuild the green corridor.
        const amb = state.activeEmergencyVehicleId ? state.vehicles[state.activeEmergencyVehicleId] : null;
        if (amb && amb.type === 'AMBULANCE' && routeRoadIds(amb.route, state.roads).includes(target)) {
          rerouteActiveAmbulance(state, `Emergency road blocked: ${target}`);
        }

        // Normal traffic also adapts immediately when a blocked segment is part
        // of one or more current routes.
        if (state.settings.simulationMode === 'MA_TRSN') {
          const affected = Object.values(state.vehicles).some(v =>
            v.type !== 'AMBULANCE' && v.state !== 'COMPLETED' && routeRoadIds(v.route, state.roads).includes(target)
          );
          if (affected) {
            const { updatedVehicles, count } = rerouteVehicles(state.vehicles, state.roads, JUNCTION_IDS);
            for (const [id, update] of Object.entries(updatedVehicles)) {
              if (state.vehicles[id]) Object.assign(state.vehicles[id], update);
            }
            if (count > 0) {
              state.activeAlgorithm = {
                algorithm: 'DIJKSTRA', timestamp: state.tick,
                reason: `Road blocked: ${target}`, routesRecalculated: count,
              };
            }
          }
        }
      });

      const road = get().roads[target];
      get().addLog('WARNING', `Road ${road?.from} → ${road?.to} BLOCKED (accident/incident)`);
    },

    unblockRoad: (roadId) => {
      set(state => {
        if (state.roads[roadId]) {
          state.roads[roadId].isBlocked = false;
          state.roads[roadId].status = 'CLEAR';
          state.roads[roadId].congestionLevel = 0.1;
        }
      });
      get().addLog('SUCCESS', `Road ${roadId} unblocked`);
    },

    unblockAllRoads: () => {
      set(state => {
        for (const road of Object.values(state.roads)) {
          if (road.isBlocked) {
            road.isBlocked = false;
            road.status = 'CLEAR';
            road.congestionLevel = 0.1;
          }
        }
      });
      get().addLog('SUCCESS', '🔓 All road blocks cleared!');
    },

    setBlockRoadMode: (active) => {
      set({ blockRoadMode: active, blockRoadFirstJunctionId: null });
      if (active) {
        get().addLog('INFO', '🚧 Road Block Mode active: Click 1st junction on the map, then 2nd junction.');
      }
    },

    setBlockRoadFirstJunctionId: (id) => {
      set({ blockRoadFirstJunctionId: id });
    },

    blockRoadBetweenJunctions: (junctionAId, junctionBId) => {
      if (junctionAId === junctionBId) return false;
      const st = get();
      const jA = st.junctions[junctionAId] || INITIAL_JUNCTIONS[junctionAId];
      const jB = st.junctions[junctionBId] || INITIAL_JUNCTIONS[junctionBId];
      const nameA = DESTINATION_BY_ID.get(junctionAId)?.label || jA?.name || junctionAId;
      const nameB = DESTINATION_BY_ID.get(junctionBId)?.label || jB?.name || junctionBId;

      const roadsToBlock: string[] = [];
      const direct1 = st.roads[`${junctionAId}-${junctionBId}`];
      const direct2 = st.roads[`${junctionBId}-${junctionAId}`];
      if (direct1) roadsToBlock.push(direct1.id);
      if (direct2 && !roadsToBlock.includes(direct2.id)) roadsToBlock.push(direct2.id);

      // If not directly adjacent, find shortest path between them and block all segments
      if (roadsToBlock.length === 0) {
        const pathRes = dijkstra(st.junctions, st.roads, junctionAId, junctionBId);
        if (pathRes && pathRes.found && pathRes.path.length > 1) {
          for (let i = 0; i < pathRes.path.length - 1; i++) {
            const u = pathRes.path[i];
            const v = pathRes.path[i + 1];
            const r = getRoadBetween(st.roads, u, v);
            if (r) {
              roadsToBlock.push(r.id);
              if (st.roads[`${v}-${u}`]) roadsToBlock.push(`${v}-${u}`);
            }
          }
        }
      }

      if (roadsToBlock.length === 0) {
        get().addLog('WARNING', `Could not find a connecting road between ${nameA} and ${nameB}`);
        set({ blockRoadMode: false, blockRoadFirstJunctionId: null });
        return false;
      }

      const allAlreadyBlocked = roadsToBlock.every(id => st.roads[id]?.isBlocked);
      if (allAlreadyBlocked) {
        set(state => {
          for (const rId of roadsToBlock) {
            if (state.roads[rId]) {
              state.roads[rId].isBlocked = false;
              state.roads[rId].status = 'CLEAR';
              state.roads[rId].congestionLevel = 0.1;
            }
          }
          state.blockRoadMode = false;
          state.blockRoadFirstJunctionId = null;
        });
        get().addLog('SUCCESS', `🔓 UNBLOCKED road between ${nameA} and ${nameB}`);
        return true;
      }

      set(state => {
        for (const rId of roadsToBlock) {
          if (state.roads[rId]) {
            state.roads[rId].isBlocked = true;
            state.roads[rId].status = 'BLOCKED';
            state.roads[rId].trafficCost = 999999;
          }
        }

        // Reroute active ambulance if needed
        const amb = state.activeEmergencyVehicleId ? state.vehicles[state.activeEmergencyVehicleId] : null;
        if (amb && amb.type === 'AMBULANCE') {
          const ambRoads = routeRoadIds(amb.route, state.roads);
          if (roadsToBlock.some(rId => ambRoads.includes(rId))) {
            rerouteActiveAmbulance(state, `Road between ${nameA} and ${nameB} blocked`);
          }
        }

        // Reroute normal traffic
        if (state.settings.simulationMode === 'MA_TRSN') {
          const { updatedVehicles, count } = rerouteVehicles(state.vehicles, state.roads, JUNCTION_IDS);
          for (const [id, update] of Object.entries(updatedVehicles)) {
            if (state.vehicles[id]) Object.assign(state.vehicles[id], update);
          }
          if (count > 0) {
            state.activeAlgorithm = {
              algorithm: 'DIJKSTRA',
              timestamp: state.tick,
              reason: `Road blocked: ${nameA} ⇄ ${nameB}`,
              routesRecalculated: count,
            };
          }
        }

        state.blockRoadMode = false;
        state.blockRoadFirstJunctionId = null;
      });

      get().addLog('WARNING', `⛔ Road between ${nameA} and ${nameB} BLOCKED! Traffic rerouted.`);
      return true;
    },

    // ---- Spawn ambulance ----
    spawnAmbulance: () => {
      const st = get();
      emergencyStartTick = st.tick;

      // Pick origin far from hospital
      const nonHospitalIds = JUNCTION_IDS.filter(id => !st.junctions[id]?.isHospital);
      const origin = nonHospitalIds[Math.floor(Math.random() * nonHospitalIds.length)];
      const destination = HOSPITAL_IDS[0];

      const result = astar(st.junctions, st.roads, origin, destination);
      if (!result.found) {
        get().addLog('WARNING', 'Could not find emergency route');
        return;
      }

      const ambulance: Vehicle = {
        id: `AMB-${Date.now()}`,
        type: 'AMBULANCE',
        origin,
        destination,
        route: result.path,
        currentJunction: origin,
        nextJunction: result.path[1],
        progress: 0,
        // Deliberately much faster than normal traffic; A* emergency vehicles
        // should visibly traverse the corridor even on the real OSM graph.
        speed: 0.28,
        state: 'EMERGENCY',
        totalDistance: 0,
        totalTime: 0,
        waitTime: 0,
        rerouted: false,
        rerouteCount: 0,
        x: st.junctions[origin]?.x ?? 0,
        y: st.junctions[origin]?.y ?? 0,
      };

      set(state => {
        state.vehicles[ambulance.id] = ambulance;
        state.activeEmergencyVehicleId = ambulance.id;
        applyEmergencyCorridor(state, result.path);
      });

      get().addLog('EMERGENCY', `Ambulance dispatched from ${st.junctions[origin]?.name} → KMC Hospital`);
      get().addLog('ALGORITHM', `A* Search activated. Route: ${result.path.join(' → ')}`);
      get().addLog('EMERGENCY', `Green corridor activated for ${result.path.length} junctions`);

      set(state => {
        state.activeAlgorithm = {
          algorithm: 'ASTAR',
          timestamp: state.tick,
          reason: 'Emergency vehicle detected',
          path: result.path,
          cost: result.totalCost,
          travelTime: result.estimatedTravelTime,
        };
        state.mode = 'EMERGENCY';
      });
    },

    // ---- Reset scenario ----
    resetScenario: () => {
      scenarioRequestToken += 1;
      completedVehiclePool = [];
      set(state => {
        state.junctions = { ...INITIAL_JUNCTIONS };
        state.roads = { ...INITIAL_ROADS };
        state.vehicles = {};
        state.mode = 'NORMAL';
        state.activeAlgorithm = null;
        state.greenCorridorJunctions = [];
        state.greenCorridorRoads = [];
        state.activeEmergencyVehicleId = null;
        state.eventLog = [];
        state.metricsHistory = [];
        state.tick = 0;
        state.simTimeSeconds = 8 * 3600;
        state.settings.spawnRate = 0.30;
        state.settings.trafficDensity = 0.35;
        state.settings.congestionSeverity = 0.25;
        state.settings.scenario = 'NORMAL';
        state.settings.simulationMode = 'MA_TRSN';
        state.selectedJunctionId = null;
        state.selectedRoadId = null;
      });
      get().addLog('INFO', 'Scenario reset to initial state');
    },

    // ---- Simulation mode ----
    setSimulationMode: (mode) => {
      set(state => { state.settings.simulationMode = mode; });
      get().addLog('INFO', `Mode switched to: ${mode}`);
    },

    runComparison: () => {
      get().addLog('INFO', 'Comparison mode: running Static Baseline vs MA-TRSN metrics');
    },

    // ---- Demo mode ----
    startDemo: () => {
      set(state => { state.demoMode = true; state.demoPhase = 1; });
    },
    stopDemo: () => {
      set(state => { state.demoMode = false; state.demoPhase = 0; });
    },
    setDemoPhase: (phase) => {
      set(state => { state.demoPhase = phase; });
    },

    // ---- Add log entry ----
    addLog: (type, message) => {
      set(state => {
        const entry = createLogEntry(state.simTimeSeconds, type, message);
        state.eventLog.unshift(entry);
        if (state.eventLog.length > MAX_LOG_ENTRIES) {
          state.eventLog = state.eventLog.slice(0, MAX_LOG_ENTRIES);
        }
      });
    },

    // ================================================================
    // MAIN SIMULATION TICK — called by the interval timer in App.tsx
    // ================================================================
    runTick: () => {
      const st = get();
      if (!st.isRunning) return;

      set(state => {
        state.tick += 1;
        state.simTimeSeconds += 1;

        const isStatic = state.settings.simulationMode === 'STATIC_BASELINE';

        // ---- 1. Tick signals ----
        for (const id of INTERSECTION_IDS) {
          const junction = state.junctions[id];
          if (!junction) continue;
          const updates = tickSignal(junction, isStatic);
          Object.assign(junction, updates);
        }

        // ---- 2. Update adaptive signal timings ----
        if (!isStatic && state.tick % 10 === 0) {
          for (const id of INTERSECTION_IDS) {
            const junction = state.junctions[id];
            if (!junction) continue;
            const decision = computeAdaptiveSignal(junction);
            junction.adaptiveGreenNS = decision.greenNS;
            junction.adaptiveGreenEW = decision.greenEW;
          }
        }

        // ---- 3. Spawn vehicles ----
        const vCount = Object.keys(state.vehicles).length;
        if (vCount < MAX_VEHICLES && Math.random() < state.settings.spawnRate * 0.15) {
          const v = spawnVehicle(state.junctions, state.roads);
          if (v) state.vehicles[v.id] = v;
        }

        // ---- 4. Move vehicles ----
        // Emergency routing is event-driven: if an ambulance's current edge was
        // blocked since the previous tick, rebuild A* before moving it.
        if (state.activeEmergencyVehicleId) {
          const amb = state.vehicles[state.activeEmergencyVehicleId];
          if (amb) {
            const currentRoad = getRoadBetween(state.roads, amb.currentJunction, amb.nextJunction);
            if (currentRoad?.isBlocked) {
              rerouteActiveAmbulance(state, `Current ambulance road blocked: ${currentRoad.id}`);
            }
          }
        }

        const completedThisTick: string[] = [];
        for (const vehicle of Object.values(state.vehicles)) {
          if (vehicle.state === 'COMPLETED') continue;
          const { vehicle: updates, completed } = tickVehicle(
            vehicle, state.junctions, state.roads, isStatic
          );
          Object.assign(state.vehicles[vehicle.id], updates);

          if (completed) {
            completedThisTick.push(vehicle.id);
            completedVehiclePool.push({ ...state.vehicles[vehicle.id] });
            state.vehicles[vehicle.id].state = 'COMPLETED';
          }
        }

        // Remove completed vehicles after a short delay (keep for metrics)
        if (state.tick % 5 === 0) {
          for (const id of Object.keys(state.vehicles)) {
            if (state.vehicles[id].state === 'COMPLETED') {
              delete state.vehicles[id];
            }
          }
        }

        // ---- 5/6. Update traffic metrics in indexed bulk passes ----
        // One pass over vehicles instead of vehicles × 6.6k junctions/8.5k roads.
        updateTrafficMetricsBulk(state.junctions, state.roads, state.vehicles);

        // Scenario conditions are persistent environmental inputs, not one-time
        // decorations. Re-apply their minimum congestion/blocking levels after
        // live vehicle metrics are calculated so Rush Hour / Major Congestion /
        // Network Overload continue to drive the adaptive algorithms.
        const scenarioConfig = SCENARIOS[state.settings.scenario];
        if (scenarioConfig) {
          for (const [id, rawOverride] of Object.entries(scenarioConfig.junctionOverrides)) {
            const override = rawOverride ?? {};
            const j = state.junctions[id];
            if (!j) continue;
            if (typeof override.congestionLevel === 'number') {
              j.congestionLevel = Math.max(j.congestionLevel, override.congestionLevel);
            }
            if (typeof override.queueNorth === 'number') j.queueNorth = Math.max(j.queueNorth, override.queueNorth);
            if (typeof override.queueSouth === 'number') j.queueSouth = Math.max(j.queueSouth, override.queueSouth);
            if (typeof override.queueEast === 'number') j.queueEast = Math.max(j.queueEast, override.queueEast);
            if (typeof override.queueWest === 'number') j.queueWest = Math.max(j.queueWest, override.queueWest);
          }
          for (const [id, rawOverride] of Object.entries(scenarioConfig.roadOverrides)) {
            const override = rawOverride ?? {};
            const r = state.roads[id];
            if (!r) continue;
            if (override.isBlocked) {
              r.isBlocked = true;
              r.status = 'BLOCKED';
              r.congestionLevel = 1;
              r.trafficCost = 999999;
            } else if (typeof override.congestionLevel === 'number') {
              r.congestionLevel = Math.max(r.congestionLevel, override.congestionLevel);
              r.status = r.congestionLevel >= 0.7 ? 'CONGESTED' : r.congestionLevel >= 0.4 ? 'MODERATE' : 'CLEAR';
              r.trafficCost = r.distance * (1 + r.congestionLevel * 3);
            }
          }
        }

        // ---- 7. Classify situation & run algorithms ----
        if (!isStatic && state.tick % CLASSIFIER_INTERVAL === 0) {
          const classification = classifySituation(
            state.junctions, state.roads, state.vehicles
          );

          const modeChanged = classification.mode !== state.mode;
          state.mode = classification.mode;

          if (modeChanged) {
            // Log mode change
            const logEntry = createLogEntry(state.simTimeSeconds, 'ALGORITHM',
              `Situation classifier → ${classification.mode}: ${classification.reason}`);
            state.eventLog.unshift(logEntry);
            if (state.eventLog.length > MAX_LOG_ENTRIES) {
              state.eventLog = state.eventLog.slice(0, MAX_LOG_ENTRIES);
            }
          }

          // ---- Run appropriate algorithm ----
          if (classification.mode === 'CONGESTION' &&
            state.tick - state.lastAlgorithmRun > 10) {
            // Reroute vehicles via Dijkstra
            const { updatedVehicles, count } = rerouteVehicles(
              state.vehicles, state.roads, JUNCTION_IDS
            );
            for (const [id, update] of Object.entries(updatedVehicles)) {
              if (state.vehicles[id]) Object.assign(state.vehicles[id], update);
            }
            state.lastAlgorithmRun = state.tick;

            if (count > 0) {
              const result: AlgorithmResult = {
                algorithm: 'DIJKSTRA',
                timestamp: state.tick,
                reason: classification.reason,
                routesRecalculated: count,
              };
              state.activeAlgorithm = result;

              const logEntry = createLogEntry(state.simTimeSeconds, 'ALGORITHM',
                `Dijkstra: ${count} routes recalculated`);
              state.eventLog.unshift(logEntry);
            }
          }

          if (classification.mode === 'NETWORK_OVERLOAD' &&
            state.tick - state.lastAlgorithmRun > 15) {
            const odPairs = getHighTrafficODPairs(state.roads, 3);
            if (odPairs.length > 0) {
              const acoResult = runACO(JUNCTION_IDS, state.roads, odPairs);
              state.acoDistribution = acoResult.distribution;
              state.lastAlgorithmRun = state.tick;

              const result: AlgorithmResult = {
                algorithm: 'ACO',
                timestamp: state.tick,
                reason: classification.reason,
                acoDistribution: acoResult.distribution,
              };
              state.activeAlgorithm = result;

              const logEntry = createLogEntry(state.simTimeSeconds, 'ALGORITHM',
                `ACO: traffic redistributed across ${acoResult.distribution.length} routes`);
              state.eventLog.unshift(logEntry);
            }
          }

          // Normal mode — adaptive signal
          if (classification.mode === 'NORMAL') {
            const result: AlgorithmResult = {
              algorithm: 'ADAPTIVE_SIGNAL',
              timestamp: state.tick,
              reason: classification.reason,
            };
            if (!state.activeAlgorithm || state.activeAlgorithm.algorithm !== 'ADAPTIVE_SIGNAL') {
              state.activeAlgorithm = result;
            }
          }
        }

        // ---- 8. Emergency vehicle corridor management ----
        if (state.activeEmergencyVehicleId) {
          const amb = state.vehicles[state.activeEmergencyVehicleId];
          if (!amb || amb.state === 'COMPLETED') {
            // Ambulance arrived — deactivate corridor
            for (const jId of state.greenCorridorJunctions) {
              if (state.junctions[jId]) state.junctions[jId].isGreenCorridor = false;
            }
            for (const rId of state.greenCorridorRoads) {
              if (state.roads[rId] && !state.roads[rId].isBlocked) {
                state.roads[rId].status = restoreRoadStatus(state.roads[rId]);
              }
            }
            state.greenCorridorJunctions = [];
            state.greenCorridorRoads = [];
            state.activeEmergencyVehicleId = null;
            state.mode = 'NORMAL';

            const responseTime = state.tick - emergencyStartTick;
            const logEntry = createLogEntry(state.simTimeSeconds, 'SUCCESS',
              `Ambulance reached destination in ${responseTime} ticks. Corridor deactivated.`);
            state.eventLog.unshift(logEntry);
            state.metrics.emergencyResponseTime = responseTime;
          }
        }

        // ---- 9. Compute metrics ----
        const metrics = computeMetrics(
          state.vehicles, state.junctions, state.roads,
          state.tick, completedVehiclePool, state.metrics.emergencyResponseTime
        );
        state.metrics = metrics;

        // Track metrics history every 3 ticks
        if (state.tick % 3 === 0) {
          state.metricsHistory.push({ ...metrics });
          if (state.metricsHistory.length > MAX_METRICS_HISTORY) {
            state.metricsHistory = state.metricsHistory.slice(-MAX_METRICS_HISTORY);
          }

          // Update comparison data
          if (isStatic) {
            state.comparisonData.staticBaseline.push({ ...metrics });
            if (state.comparisonData.staticBaseline.length > 40) {
              state.comparisonData.staticBaseline = state.comparisonData.staticBaseline.slice(-40);
            }
          } else {
            state.comparisonData.maTraffic.push({ ...metrics });
            if (state.comparisonData.maTraffic.length > 40) {
              state.comparisonData.maTraffic = state.comparisonData.maTraffic.slice(-40);
            }
          }
        }
      });
    },
  }))
);
