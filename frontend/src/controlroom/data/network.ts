import type { Junction, Road } from '../types';

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 600;
export const OSM_BOUNDS = { minLat: 10.9005683, maxLat: 11.1242805, minLon: 76.8399031, maxLon: 77.0683502 };
export const VISUAL_BOUNDS = OSM_BOUNDS;

export interface RoadGraphNode { id: string; lat: number; lon: number; }
export interface RoadGraphEdge { source: string; target: string; length: number; bidirectional: boolean; }
interface RoadGraphPayload { nodes: RoadGraphNode[]; edges: RoadGraphEdge[]; }

export let INITIAL_JUNCTIONS: Record<string, Junction> = {};
export let INITIAL_ROADS: Record<string, Road> = {};
export let OSM_NODE_COUNT = 0;
export let OSM_ROAD_COUNT = 0;
export let JUNCTION_IDS: string[] = [];
export let INTERSECTION_IDS = new Set<string>();
export let VISIBLE_INTERSECTION_IDS = new Set<string>();
export let ROAD_ADJACENCY: Record<string, string[]> = {};

// Verified Major Emergency Hospitals of Coimbatore
// 10593619297: PSG Hospitals, 9255100786: KMCH Hospital, 11760103234: GKNM Hospital,
// 13999738605: Ganga Hospital, 13999738905: Sri Ramakrishna Hospital, 2166442088: KG Hospital, 2173379743: Podanur GH
export const HOSPITAL_IDS = ['10593619297', '9255100786', '2173379743', '11760103234', '13999738605', '13999738905', '2166442088'];

let loaded = false;
let loading: Promise<void> | null = null;
function hashString(value: string): number { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(value: string): number { return (hashString(value) % 1000) / 1000; }

function createJunction(node: RoadGraphNode): Junction {
  const x = ((node.lon - OSM_BOUNDS.minLon) / (OSM_BOUNDS.maxLon - OSM_BOUNDS.minLon)) * MAP_WIDTH;
  const y = ((OSM_BOUNDS.maxLat - node.lat) / (OSM_BOUNDS.maxLat - OSM_BOUNDS.minLat)) * MAP_HEIGHT;
  const r = seeded(node.id);
  return {
    id: node.id, name: `Junction ${node.id}`, shortName: node.id, x, y, lat: node.lat, lon: node.lon,
    isHospital: HOSPITAL_IDS.includes(node.id), signalPhase: r < .34 ? 'GREEN' : r < .67 ? 'YELLOW' : 'RED',
    signalTimer: 10 + Math.floor(r * 40), signalCycleTime: 60, currentGreenDirection: r < .5 ? 'NS' : 'EW',
    queueNorth: 0, queueSouth: 0, queueEast: 0, queueWest: 0, congestionLevel: .03 + r * .10,
    vehiclesPassing: 0, vehiclesWaiting: 0, adaptiveGreenNS: 30, adaptiveGreenEW: 30, fixedGreen: 30,
    isGreenCorridor: false, isSelected: false,
  };
}

function createRoad(edge: RoadGraphEdge): Road {
  const r = seeded(`${edge.source}-${edge.target}`);
  const lanes = r > .82 ? 2 : 1;
  const averageSpeed = 25 + Math.round(r * 25);
  const distance = Math.max(.001, edge.length);
  const capacity = lanes * 18;
  const congestionLevel = .03 + r * .10;
  return {
    id: `${edge.source}-${edge.target}`, from: edge.source, to: edge.target, bidirectional: edge.bidirectional,
    distance, lanes, vehicleCount: 0, capacity, congestionLevel, averageSpeed,
    travelTime: (distance / averageSpeed) * 60, trafficCost: distance * (1 + congestionLevel * 3),
    status: 'CLEAR', isBlocked: false, activeVehicleIds: [],
  };
}

export function buildAdjacency(roads: Record<string, Road>): Record<string, string[]> {
  const adj: Record<string, string[]> = {};
  for (const road of Object.values(roads)) { if (road.isBlocked) continue; (adj[road.from] ??= []).push(road.to); if (road.bidirectional) (adj[road.to] ??= []).push(road.from); }
  return adj;
}
export function getRoadBetween(roads: Record<string, Road>, from: string, to: string): Road | null { const direct = roads[`${from}-${to}`]; if (direct) return direct; const reverse = roads[`${to}-${from}`]; return reverse?.bidirectional ? reverse : null; }
export function computeEdgeCost(road: Road): number { return road.isBlocked ? 999999 : road.distance * (1 + road.congestionLevel * 3); }

function installGraph(payload: RoadGraphPayload) {
  const junctions: Record<string, Junction> = {};
  const roads: Record<string, Road> = {};
  const degree = new Map<string, number>();
  for (const node of payload.nodes) junctions[node.id] = createJunction(node);
  for (const edge of payload.edges) {
    const road = createRoad(edge); roads[road.id] = road;
    degree.set(road.from, (degree.get(road.from) ?? 0) + 1); degree.set(road.to, (degree.get(road.to) ?? 0) + 1);
  }
  INITIAL_JUNCTIONS = junctions; INITIAL_ROADS = roads;
  OSM_NODE_COUNT = payload.nodes.length; OSM_ROAD_COUNT = payload.edges.length; JUNCTION_IDS = Object.keys(junctions);
  INTERSECTION_IDS = new Set(JUNCTION_IDS.filter(id => (degree.get(id) ?? 0) !== 2 || HOSPITAL_IDS.includes(id)));
  VISIBLE_INTERSECTION_IDS = new Set(INTERSECTION_IDS); ROAD_ADJACENCY = buildAdjacency(roads); loaded = true;
}

export async function loadNetwork(): Promise<void> {
  if (loaded) return; if (loading) return loading;
  loading = fetch('/data/roadGraph.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`Road graph load failed: ${r.status}`); return r.json() as Promise<RoadGraphPayload>; }).then(installGraph);
  try { await loading; } finally { loading = null; }
}
