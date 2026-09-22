// ============================================================
// SIMULATION ENGINE
// Core tick-based loop driving all simulation state changes.
// ============================================================

import type {
  Junction, Road, Vehicle, SimulationState, LogEntry,
  MetricsSnapshot, VehicleState
} from '../types';
import { dijkstra } from '../algorithms/dijkstra';
import { INTERSECTION_IDS, VISIBLE_INTERSECTION_IDS } from '../data/network';
import { astar } from '../algorithms/astar';
import { computeAdaptiveSignal, tickSignal } from '../algorithms/adaptiveSignal';
import { runACO, getHighTrafficODPairs } from '../algorithms/aco';
import { classifySituation } from '../algorithms/situationClassifier';
import { computeEdgeCost, getRoadBetween, HOSPITAL_IDS, JUNCTION_IDS } from '../data/network';
import { DESTINATION_IDS } from '../data/destinations';

let _vehicleIdCounter = 1;
let _logIdCounter = 1;
let previousMetricRoadIds = new Set<string>();
let cachedBlockedRoadCount = 0;
let metricUpdateCounter = 0;

export function nextVehicleId(): string {
  return `V${String(_vehicleIdCounter++).padStart(4, '0')}`;
}

function nextLogId(): string {
  return `L${String(_logIdCounter++).padStart(5, '0')}`;
}

function simTimeStr(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createLogEntry(
  simTime: number,
  type: LogEntry['type'],
  message: string
): LogEntry {
  return {
    id: nextLogId(),
    timestamp: simTime,
    realTime: simTimeStr(simTime),
    type,
    message,
  };
}

// ---- Vehicle position interpolation ----
export function getVehiclePosition(
  vehicle: Vehicle,
  junctions: Record<string, Junction>
): { x: number; y: number } {
  const from = junctions[vehicle.currentJunction];
  const to = junctions[vehicle.nextJunction];
  if (!from || !to) return { x: from?.x ?? 0, y: from?.y ?? 0 };
  const t = vehicle.progress;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

// ---- Spawn a single vehicle ----
export function spawnVehicle(
  junctions: Record<string, Junction>,
  roads: Record<string, Road>,
  origin?: string,
  destination?: string,
  isEmergency: boolean = false
): Vehicle | null {
  const jIds = Array.from(INTERSECTION_IDS);
  const visibleIds = Array.from(VISIBLE_INTERSECTION_IDS);
  const destinationIds = Array.from(DESTINATION_IDS);
  const hospitalIds = HOSPITAL_IDS;

  const orig = origin ?? visibleIds[Math.floor(Math.random() * visibleIds.length)] ?? jIds[Math.floor(Math.random() * jIds.length)];
  let dest: string;
  if (isEmergency) {
    dest = destination ?? hospitalIds[Math.floor(Math.random() * hospitalIds.length)];
  } else {
    const candidates = destinationIds.filter(id => id !== orig);
    dest = destination ?? candidates[Math.floor(Math.random() * candidates.length)] ?? jIds.find(id => id !== orig) ?? orig;
  }

  if (orig === dest) return null;

  const routeResult = dijkstra(JUNCTION_IDS, roads, orig, dest);
  if (!routeResult.found || routeResult.path.length < 2) return null;

  const id = nextVehicleId();
  const fromJ = junctions[orig];
  const toJ = junctions[routeResult.path[1]];

  return {
    id,
    type: isEmergency ? 'AMBULANCE' : Math.random() < 0.15 ? 'BUS' : 'CAR',
    origin: orig,
    destination: dest,
    route: routeResult.path,
    currentJunction: orig,
    nextJunction: routeResult.path[1],
    progress: 0,
    // Progress units per simulation tick. The UI's 0.5x/1x/2x/4x control
    // also changes tick frequency; these higher base speeds make 4x visibly fast.
    speed: isEmergency ? 0.32 : Math.random() * 0.05 + 0.11,
    state: 'NORMAL',
    totalDistance: 0,
    totalTime: 0,
    waitTime: 0,
    rerouted: false,
    rerouteCount: 0,
    x: fromJ?.x ?? 0,
    y: fromJ?.y ?? 0,
  };
}

// ---- Check if vehicle can pass through signal ----
function canPassSignal(vehicle: Vehicle, junction: Junction): boolean {
  // Ambulances have signal priority. Once dispatched they must never stall at
  // intermediate OSM geometry/intersection nodes; the green corridor exists to
  // guarantee uninterrupted passage.
  if (vehicle.type === 'AMBULANCE') return true;
  if (junction.signalPhase === 'GREEN') return true;
  if (junction.signalPhase === 'YELLOW') return Math.random() < 0.3; // some pass on yellow
  return false;
}

// ---- Move a single vehicle one tick ----
export function tickVehicle(
  vehicle: Vehicle,
  junctions: Record<string, Junction>,
  roads: Record<string, Road>,
  isStaticMode: boolean
): { vehicle: Partial<Vehicle>; completed: boolean; arrivedAt?: string } {
  if (vehicle.state === 'COMPLETED') return { vehicle: {}, completed: true };

  const currentJ = junctions[vehicle.currentJunction];
  const nextJ = junctions[vehicle.nextJunction];

  if (!currentJ || !nextJ) {
    return { vehicle: { state: 'COMPLETED' }, completed: true };
  }

  const road = getRoadBetween(roads, vehicle.currentJunction, vehicle.nextJunction);

  // Check if road became blocked
  if (road?.isBlocked) {
    return { vehicle: { state: 'REROUTING' }, completed: false };
  }

  // At the start of edge (progress ~0): check signal at current junction
  if (vehicle.progress < 0.05) {
    const greenDir = currentJ.currentGreenDirection;
    // Determine direction of travel
    const dx = nextJ.x - currentJ.x;
    const dy = nextJ.y - currentJ.y;
    const isNS = Math.abs(dy) > Math.abs(dx);
    const isGreenForDirection =
      (isNS && greenDir === 'NS') || (!isNS && greenDir === 'EW');

    if (vehicle.type !== 'AMBULANCE' && (!canPassSignal(vehicle, currentJ) || !isGreenForDirection)) {
      // Wait at red
      return {
        vehicle: {
          state: 'WAITING',
          waitTime: vehicle.waitTime + 1,
          totalTime: vehicle.totalTime + 1,
        },
        completed: false,
      };
    }
  }

  // Move along edge
  // Emergency vehicles get a protected corridor and should remain visibly
  // faster even when surrounding roads are congested. Normal traffic still
  // responds strongly to congestion.
  const speedMultiplier = vehicle.type === 'AMBULANCE'
    ? (road ? Math.max(0.82, 1 - road.congestionLevel * 0.25) : 1)
    : (road ? Math.max(0.5, 1 - road.congestionLevel * 0.55) : 1);
  const newProgress = vehicle.progress + vehicle.speed * speedMultiplier;

  if (newProgress >= 1.0) {
    // Arrived at next junction
    const arrivedAt = vehicle.nextJunction;
    const routeIdx = vehicle.route.indexOf(arrivedAt);

    if (arrivedAt === vehicle.destination || routeIdx >= vehicle.route.length - 1) {
      // Journey complete
      return {
        vehicle: {
          state: 'COMPLETED',
          currentJunction: arrivedAt,
          nextJunction: arrivedAt,
          progress: 1,
          x: nextJ.x,
          y: nextJ.y,
          totalTime: vehicle.totalTime + 1,
        },
        completed: true,
        arrivedAt,
      };
    }

    // Move to next segment
    const nextIdx = routeIdx + 1;
    const nextNextId = vehicle.route[nextIdx];

    return {
      vehicle: {
        state: vehicle.type === 'AMBULANCE' ? 'EMERGENCY' : 'NORMAL',
        currentJunction: arrivedAt,
        nextJunction: nextNextId,
        progress: 0,
        x: nextJ.x,
        y: nextJ.y,
        totalDistance: vehicle.totalDistance + (road?.distance ?? 0),
        totalTime: vehicle.totalTime + 1,
      },
      completed: false,
      arrivedAt,
    };
  }

  // Still moving along edge
  const fromJ = junctions[vehicle.currentJunction];
  const toJ = junctions[vehicle.nextJunction];
  const nx = fromJ.x + (toJ.x - fromJ.x) * newProgress;
  const ny = fromJ.y + (toJ.y - fromJ.y) * newProgress;

  return {
    vehicle: {
      state: vehicle.type === 'AMBULANCE' ? 'EMERGENCY' : 'NORMAL',
      progress: newProgress,
      x: nx,
      y: ny,
      totalTime: vehicle.totalTime + 1,
    },
    completed: false,
  };
}

// ---- Update junction queues based on vehicles ----
export function updateJunctionQueues(
  junction: Junction,
  vehicles: Record<string, Vehicle>
): Partial<Junction> {
  let waiting = 0;
  let passing = 0;

  for (const v of Object.values(vehicles)) {
    if (v.currentJunction === junction.id && v.state === 'WAITING') waiting++;
    if (v.currentJunction === junction.id && v.state === 'NORMAL') passing++;
  }

  // Simulate queue per direction based on total waiting
  const baseQ = Math.floor(waiting / 4);
  const qN = baseQ + Math.floor(Math.random() * 2);
  const qS = baseQ + Math.floor(Math.random() * 2);
  const qE = Math.ceil(waiting / 2) - qN + Math.floor(Math.random() * 2);
  const qW = Math.max(0, waiting - qN - qS - qE);

  const congestion = Math.min(1, (waiting + passing) / 20);

  return {
    queueNorth: Math.max(0, qN),
    queueSouth: Math.max(0, qS),
    queueEast: Math.max(0, qE),
    queueWest: Math.max(0, qW),
    vehiclesWaiting: waiting,
    vehiclesPassing: passing,
    congestionLevel: congestion,
  };
}

// ---- Update road metrics ----
export function updateRoadMetrics(
  road: Road,
  vehicles: Record<string, Vehicle>
): Partial<Road> {
  if (road.isBlocked) {
    return { status: 'BLOCKED', vehicleCount: 0, congestionLevel: 1.0, trafficCost: 999999 };
  }

  const activeVehicles = Object.values(vehicles).filter(
    v =>
      ((v.currentJunction === road.from && v.nextJunction === road.to) ||
        (v.currentJunction === road.to && v.nextJunction === road.from)) &&
      v.state !== 'COMPLETED'
  );

  const count = activeVehicles.length;
  const congestion = Math.min(1, count / road.capacity);
  const speed = road.averageSpeed * (1 - congestion * 0.7);
  const travelTime = (road.distance / Math.max(speed, 5)) * 60;
  const trafficCost = computeEdgeCost({ ...road, congestionLevel: congestion });

  let status: Road['status'] = 'CLEAR';
  if (congestion >= 0.7) status = 'CONGESTED';
  else if (congestion >= 0.4) status = 'MODERATE';

  return {
    vehicleCount: count,
    congestionLevel: congestion,
    averageSpeed: speed,
    travelTime,
    trafficCost,
    status,
    activeVehicleIds: activeVehicles.map(v => v.id),
  };
}


// ---- Bulk traffic metric updates ----
// The old implementation scanned every vehicle once per junction and once per road.
// With the real OSM graph that became millions of comparisons per simulation tick.
// Build two indexes in one pass over the (small) active vehicle set instead.
export function updateTrafficMetricsBulk(
  junctions: Record<string, Junction>,
  roads: Record<string, Road>,
  vehicles: Record<string, Vehicle>
): void {
  const waitingByJunction = new Map<string, number>();
  const passingByJunction = new Map<string, number>();
  const vehiclesByRoad = new Map<string, string[]>();

  for (const v of Object.values(vehicles)) {
    if (v.state === 'COMPLETED') continue;

    if (v.state === 'WAITING') {
      waitingByJunction.set(v.currentJunction, (waitingByJunction.get(v.currentJunction) ?? 0) + 1);
    } else if (v.state === 'NORMAL') {
      passingByJunction.set(v.currentJunction, (passingByJunction.get(v.currentJunction) ?? 0) + 1);
    }

    const directId = `${v.currentJunction}-${v.nextJunction}`;
    const reverseId = `${v.nextJunction}-${v.currentJunction}`;
    const road = roads[directId] ?? (roads[reverseId]?.bidirectional ? roads[reverseId] : undefined);
    if (road) {
      const list = vehiclesByRoad.get(road.id);
      if (list) list.push(v.id);
      else vehiclesByRoad.set(road.id, [v.id]);
    }
  }

  // Only signalized/intersection nodes need queue calculations. Degree-2 OSM
  // geometry points do not represent independent traffic signals.
  for (const id of INTERSECTION_IDS) {
    const junction = junctions[id];
    if (!junction) continue;
    const waiting = waitingByJunction.get(id) ?? 0;
    const passing = passingByJunction.get(id) ?? 0;
    const baseQ = Math.floor(waiting / 4);
    const qN = baseQ + Math.floor(Math.random() * 2);
    const qS = baseQ + Math.floor(Math.random() * 2);
    const qE = Math.ceil(waiting / 2) - qN + Math.floor(Math.random() * 2);
    const qW = Math.max(0, waiting - qN - qS - qE);
    Object.assign(junction, {
      queueNorth: Math.max(0, qN),
      queueSouth: Math.max(0, qS),
      queueEast: Math.max(0, qE),
      queueWest: Math.max(0, qW),
      vehiclesWaiting: waiting,
      vehiclesPassing: passing,
      congestionLevel: Math.min(1, (waiting + passing) / 20),
    });
  }

  // Update only roads that were active on the previous/current tick. This avoids
  // touching all ~96k OSM segments every simulation tick.
  const touched = new Set<string>(previousMetricRoadIds);
  for (const id of vehiclesByRoad.keys()) touched.add(id);
  for (const id of touched) {
    const road = roads[id];
    if (!road) continue;
    if (road.isBlocked) {
      Object.assign(road, { status: 'BLOCKED', vehicleCount: 0, congestionLevel: 1, trafficCost: 999999, activeVehicleIds: [] });
      continue;
    }
    const ids = vehiclesByRoad.get(id) ?? [];
    const count = ids.length;
    const congestion = Math.min(1, count / road.capacity);
    const speed = road.averageSpeed * (1 - congestion * 0.7);
    const travelTime = (road.distance / Math.max(speed, 5)) * 60;
    let status: Road['status'] = 'CLEAR';
    if (congestion >= 0.7) status = 'CONGESTED';
    else if (congestion >= 0.4) status = 'MODERATE';
    Object.assign(road, {
      vehicleCount: count,
      congestionLevel: congestion,
      averageSpeed: speed,
      travelTime,
      trafficCost: computeEdgeCost({ ...road, congestionLevel: congestion }),
      status,
      activeVehicleIds: ids,
    });
  }
  previousMetricRoadIds = new Set(vehiclesByRoad.keys());

  // Block count is only a dashboard metric. Refresh periodically rather than
  // scanning the entire OSM road dictionary every frame.
  metricUpdateCounter++;
  if (metricUpdateCounter === 1 || metricUpdateCounter % 20 === 0) {
    let blocked = 0;
    for (const road of Object.values(roads)) if (road.isBlocked) blocked++;
    cachedBlockedRoadCount = blocked;
  }
}

// ---- Compute current metrics snapshot ----
export function computeMetrics(
  vehicles: Record<string, Vehicle>,
  junctions: Record<string, Junction>,
  roads: Record<string, Road>,
  tick: number,
  completedVehicles: Vehicle[],
  emergencyResponseTime: number
): MetricsSnapshot {
  const vList = Object.values(vehicles);
  const active = vList.filter(v => v.state !== 'COMPLETED');
  const rerouted = vList.filter(v => v.rerouted).length;
  let congestedJ = 0;
  let totalQueue = 0;
  for (const id of INTERSECTION_IDS) {
    const j = junctions[id];
    if (!j) continue;
    if (j.congestionLevel >= 0.55) congestedJ++;
    totalQueue += j.queueNorth + j.queueSouth + j.queueEast + j.queueWest;
  }

  const avgTravel = completedVehicles.length > 0
    ? completedVehicles.reduce((s, v) => s + v.totalTime, 0) / completedVehicles.length : 0;
  const avgWait = active.length > 0
    ? active.reduce((s, v) => s + v.waitTime, 0) / active.length : 0;

  // Approximate utilization from roads currently occupied by vehicles.
  let roadUtilSum = 0;
  let activeRoads = 0;
  const seenRoads = new Set<string>();
  for (const v of active) {
    const road = roads[`${v.currentJunction}-${v.nextJunction}`] ?? roads[`${v.nextJunction}-${v.currentJunction}`];
    if (road && !seenRoads.has(road.id)) {
      seenRoads.add(road.id);
      roadUtilSum += road.congestionLevel;
      activeRoads++;
    }
  }

  return {
    tick,
    avgTravelTime: Math.round(avgTravel * 10) / 10,
    avgWaitTime: Math.round(avgWait * 10) / 10,
    vehiclesCompleted: completedVehicles.length,
    vehiclesRerouted: rerouted,
    congestedJunctions: congestedJ,
    totalQueueLength: totalQueue,
    activeVehicles: active.length,
    blockedRoads: cachedBlockedRoadCount,
    emergencyResponseTime,
    avgRoadUtilization: Math.round((roadUtilSum / Math.max(1, activeRoads)) * 100) / 100,
  };
}

export function rerouteVehicles(
  vehicles: Record<string, Vehicle>,
  roads: Record<string, Road>,
  junctionIds: string[]
): { updatedVehicles: Record<string, Partial<Vehicle>>; count: number } {
  const updates: Record<string, Partial<Vehicle>> = {};
  let count = 0;

  for (const vehicle of Object.values(vehicles)) {
    if (vehicle.state === 'COMPLETED' || vehicle.type === 'AMBULANCE') continue;

    const result = dijkstra(junctionIds, roads, vehicle.currentJunction, vehicle.destination);
    if (result.found && result.path.length >= 2) {
      // Only reroute if new path differs significantly
      const currentRemaining = vehicle.route.slice(vehicle.route.indexOf(vehicle.currentJunction));
      if (result.path.join(',') !== currentRemaining.join(',')) {
        updates[vehicle.id] = {
          route: result.path,
          nextJunction: result.path[1],
          state: 'REROUTING',
          rerouted: true,
          rerouteCount: vehicle.rerouteCount + 1,
        };
        count++;
      }
    }
  }

  return { updatedVehicles: updates, count };
}

// ---- Green corridor management ----
export function activateGreenCorridor(
  junctions: Record<string, Junction>,
  route: string[]
): Record<string, Partial<Junction>> {
  const updates: Record<string, Partial<Junction>> = {};
  for (const jId of route) {
    updates[jId] = { isGreenCorridor: true, signalPhase: 'GREEN', signalTimer: 60 };
  }
  return updates;
}

export function deactivateGreenCorridor(
  junctions: Record<string, Junction>,
  junctionId: string
): Partial<Junction> {
  return { isGreenCorridor: false };
}
