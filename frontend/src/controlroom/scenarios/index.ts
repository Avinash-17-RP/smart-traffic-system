// ============================================================
// SCENARIO PRESETS
// Scenario effects are mapped onto the real OSM Coimbatore graph.
// No fake J1/J2/... IDs are used.
// ============================================================

import type { Junction, Road, SimulationSettings } from '../types';
import { INITIAL_JUNCTIONS, INITIAL_ROADS } from '../data/network';
import { DESTINATION_IDS } from '../data/destinations';

export interface ScenarioConfig {
  id: string;
  name: string;
  description: string;
  settings: Partial<SimulationSettings>;
  junctionOverrides: Partial<Record<string, Partial<Junction>>>;
  roadOverrides: Partial<Record<string, Partial<Road>>>;
  initialVehicleCount: number;
  introMessage: string;
}

// Curated real OSM destinations used as scenario hotspots.
const CENTRAL_TARGETS = [
  '9921938865',  // Gandhipuram Bus Stand
  '6965305056',  // Coimbatore Junction
  '9322756498',  // Town Hall
  '9225687032',  // Race Course
  '803271937',   // Coimbatore / city centre
  '330044079',   // RS Puram
  '4594632777',  // Singanallur
  '13999738676', // CODISSIA
];

function nearbyRoads(targetIds: string[], limit = 6): Road[] {
  const targets = new Set(targetIds);
  return Object.values(INITIAL_ROADS)
    .filter(r => !r.isBlocked && (targets.has(r.from) || targets.has(r.to)))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function makeJunctionOverrides(targetIds: string[], level: number): Partial<Record<string, Partial<Junction>>> {
  const result: Partial<Record<string, Partial<Junction>>> = {};
  targetIds.forEach((id, index) => {
    if (!INITIAL_JUNCTIONS[id]) return;
    const base = 8 + Math.floor(level * 20) + (index % 4) * 2;
    result[id] = {
      congestionLevel: Math.min(1, level + (index % 3) * 0.025),
      queueNorth: base,
      queueSouth: Math.max(4, base - 2),
      queueEast: base + 5,
      queueWest: Math.max(3, base - 4),
      vehiclesWaiting: base * 2,
    };
  });
  return result;
}

function makeRoadOverrides(targetIds: string[], level: number): Partial<Record<string, Partial<Road>>> {
  const result: Partial<Record<string, Partial<Road>>> = {};
  for (const road of nearbyRoads(targetIds, 18)) {
    const congestion = Math.min(0.98, level + ((Number(road.from.slice(-2)) || 0) % 5) * 0.025);
    result[road.id] = {
      congestionLevel: congestion,
      vehicleCount: Math.min(road.capacity, Math.round(congestion * road.capacity)),
      status: congestion >= 0.7 ? 'CONGESTED' : congestion >= 0.4 ? 'MODERATE' : 'CLEAR',
    };
  }
  return result;
}

const accidentRoad = nearbyRoads(CENTRAL_TARGETS.slice(0, 3), 1)[0];

export const SCENARIOS: Record<string, ScenarioConfig> = {
  NORMAL: {
    id: 'NORMAL',
    name: 'Normal Traffic',
    description: 'Moderate vehicle flow across the real Coimbatore road network.',
    settings: { spawnRate: 0.30, trafficDensity: 0.30, congestionSeverity: 0.20 },
    junctionOverrides: {},
    roadOverrides: {},
    initialVehicleCount: 20,
    introMessage: 'Normal traffic loaded. Adaptive Signal Control active across the OSM network.',
  },

  RUSH_HOUR: {
    id: 'RUSH_HOUR',
    name: 'Rush Hour',
    description: 'Heavy morning traffic around major Coimbatore destinations and corridors.',
    settings: { spawnRate: 0.80, trafficDensity: 0.70, congestionSeverity: 0.50 },
    junctionOverrides: makeJunctionOverrides(CENTRAL_TARGETS.slice(0, 6), 0.55),
    roadOverrides: makeRoadOverrides(CENTRAL_TARGETS.slice(0, 6), 0.50),
    initialVehicleCount: 60,
    introMessage: 'Rush hour loaded. Congestion is building around major Coimbatore corridors.',
  },

  MAJOR_CONGESTION: {
    id: 'MAJOR_CONGESTION',
    name: 'Major Congestion',
    description: 'Severe bottlenecks around central Coimbatore; Dijkstra reroutes traffic.',
    settings: { spawnRate: 0.60, trafficDensity: 0.60, congestionSeverity: 0.85 },
    junctionOverrides: makeJunctionOverrides(CENTRAL_TARGETS.slice(0, 5), 0.82),
    roadOverrides: makeRoadOverrides(CENTRAL_TARGETS.slice(0, 5), 0.78),
    initialVehicleCount: 50,
    introMessage: 'Major congestion loaded on real OSM corridors. Dijkstra will recalculate routes.',
  },

  ROAD_ACCIDENT: {
    id: 'ROAD_ACCIDENT',
    name: 'Road Accident',
    description: 'A real OSM road segment is blocked; traffic and emergency routes must adapt.',
    settings: { spawnRate: 0.50, trafficDensity: 0.50, congestionSeverity: 0.60 },
    junctionOverrides: makeJunctionOverrides(CENTRAL_TARGETS.slice(0, 3), 0.65),
    roadOverrides: accidentRoad ? {
      [accidentRoad.id]: { isBlocked: true, status: 'BLOCKED', congestionLevel: 1.0, vehicleCount: 0 },
    } : {},
    initialVehicleCount: 40,
    introMessage: `Road accident loaded. ${accidentRoad ? `OSM segment ${accidentRoad.from} → ${accidentRoad.to}` : 'A central road'} is blocked; routing will adapt.`,
  },

  EMERGENCY: {
    id: 'EMERGENCY',
    name: 'Emergency Vehicle',
    description: 'An ambulance uses A* and a dynamic green corridor to reach a hospital.',
    settings: { spawnRate: 0.40, trafficDensity: 0.45, congestionSeverity: 0.40 },
    junctionOverrides: {},
    roadOverrides: {},
    initialVehicleCount: 30,
    introMessage: 'Emergency scenario loaded. Ambulance + A* + dynamic green corridor ready.',
  },

  NETWORK_OVERLOAD: {
    id: 'NETWORK_OVERLOAD',
    name: 'Network Overload',
    description: 'High demand across major destinations; ACO redistributes traffic.',
    settings: { spawnRate: 1.00, trafficDensity: 0.90, congestionSeverity: 0.90 },
    junctionOverrides: makeJunctionOverrides(CENTRAL_TARGETS, 0.72),
    roadOverrides: makeRoadOverrides(CENTRAL_TARGETS, 0.68),
    initialVehicleCount: 80,
    introMessage: 'Network overload loaded across the real OSM network. ACO load balancing is active.',
  },
};

export function applyScenario(
  junctions: Record<string, Junction>,
  roads: Record<string, Road>,
  scenario: ScenarioConfig
): { junctions: Record<string, Junction>; roads: Record<string, Road> } {
  const newJunctions = { ...junctions };
  const newRoads = { ...roads };

  for (const [id, override] of Object.entries(scenario.junctionOverrides)) {
    if (newJunctions[id]) newJunctions[id] = { ...newJunctions[id], ...override };
  }

  for (const [id, override] of Object.entries(scenario.roadOverrides)) {
    if (newRoads[id]) newRoads[id] = { ...newRoads[id], ...override };
  }

  return { junctions: newJunctions, roads: newRoads };
}

// Keep this export useful for UI/debugging without coupling scenarios to fake nodes.
export const SCENARIO_DESTINATION_IDS = new Set(CENTRAL_TARGETS.filter(id => DESTINATION_IDS.has(id)));
