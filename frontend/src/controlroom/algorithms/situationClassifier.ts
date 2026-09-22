// ============================================================
// SITUATION CLASSIFIER
// Evaluates network state every N ticks and selects algorithm.
// Priority: EMERGENCY > NETWORK_OVERLOAD > CONGESTION > NORMAL
// ============================================================

import type { Junction, Road, Vehicle, AlgorithmMode } from '../types';

export interface ClassificationResult {
  mode: AlgorithmMode;
  algorithm: 'DIJKSTRA' | 'ASTAR' | 'ADAPTIVE_SIGNAL' | 'ACO';
  reason: string;
  confidence: number; // 0–1
  details: {
    emergencyActive: boolean;
    congestedJunctionCount: number;
    congestedRoadCount: number;
    avgDensity: number;
    networkLoadPercent: number;
  };
}

const CONGESTION_THRESHOLD = 0.55;          // junction congestion level
const NETWORK_OVERLOAD_THRESHOLD = 0.60;   // fraction of roads congested
const MIN_CONGESTED_JUNCTIONS = 2;         // trigger Dijkstra

export function classifySituation(
  junctions: Record<string, Junction>,
  roads: Record<string, Road>,
  vehicles: Record<string, Vehicle>
): ClassificationResult {
  const junctionList = Object.values(junctions);
  const roadList = Object.values(roads);
  const vehicleList = Object.values(vehicles);

  // --- Check for emergency vehicles ---
  const emergencyVehicles = vehicleList.filter(
    v => v.type === 'AMBULANCE' && v.state !== 'COMPLETED'
  );
  const emergencyActive = emergencyVehicles.length > 0;

  // --- Congestion metrics ---
  const congestedJunctions = junctionList.filter(
    j => j.congestionLevel >= CONGESTION_THRESHOLD
  );
  const congestedRoads = roadList.filter(
    r => r.congestionLevel >= CONGESTION_THRESHOLD || r.isBlocked
  );

  const avgDensity =
    roadList.length > 0
      ? roadList.reduce((s, r) => s + r.congestionLevel, 0) / roadList.length
      : 0;

  const networkLoadPercent =
    roadList.length > 0
      ? (congestedRoads.length / roadList.length) * 100
      : 0;

  // --- Priority classification ---

  // 1. EMERGENCY — highest priority
  if (emergencyActive) {
    return {
      mode: 'EMERGENCY',
      algorithm: 'ASTAR',
      reason: `Emergency vehicle detected. A* routing for fastest corridor.`,
      confidence: 1.0,
      details: {
        emergencyActive: true,
        congestedJunctionCount: congestedJunctions.length,
        congestedRoadCount: congestedRoads.length,
        avgDensity,
        networkLoadPercent,
      },
    };
  }

  // 2. NETWORK_OVERLOAD — > 60% roads congested or high average density
  if (networkLoadPercent >= NETWORK_OVERLOAD_THRESHOLD * 100 || avgDensity >= 0.70) {
    return {
      mode: 'NETWORK_OVERLOAD',
      algorithm: 'ACO',
      reason: `Network-wide overload: ${Math.round(networkLoadPercent)}% roads congested, avg density ${(avgDensity * 100).toFixed(0)}%. ACO load balancing activated.`,
      confidence: Math.min(1, avgDensity / 0.85),
      details: {
        emergencyActive: false,
        congestedJunctionCount: congestedJunctions.length,
        congestedRoadCount: congestedRoads.length,
        avgDensity,
        networkLoadPercent,
      },
    };
  }

  // 3. CONGESTION — localized
  if (congestedJunctions.length >= MIN_CONGESTED_JUNCTIONS) {
    const junctionNames = congestedJunctions
      .slice(0, 3)
      .map(j => j.shortName)
      .join(', ');
    return {
      mode: 'CONGESTION',
      algorithm: 'DIJKSTRA',
      reason: `Heavy congestion at ${junctionNames} (${congestedJunctions.length} junctions ≥ ${Math.round(CONGESTION_THRESHOLD * 100)}%). Dijkstra rerouting active.`,
      confidence: Math.min(1, congestedJunctions.length / 5),
      details: {
        emergencyActive: false,
        congestedJunctionCount: congestedJunctions.length,
        congestedRoadCount: congestedRoads.length,
        avgDensity,
        networkLoadPercent,
      },
    };
  }

  // 4. NORMAL — adaptive signals
  return {
    mode: 'NORMAL',
    algorithm: 'ADAPTIVE_SIGNAL',
    reason: `Traffic nominal. ${congestedJunctions.length} congested junction(s). Adaptive signal control maintaining flow.`,
    confidence: 1 - avgDensity,
    details: {
      emergencyActive: false,
      congestedJunctionCount: congestedJunctions.length,
      congestedRoadCount: congestedRoads.length,
      avgDensity,
      networkLoadPercent,
    },
  };
}
