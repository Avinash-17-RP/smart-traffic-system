// ============================================================
// MA-TRSN — Core Domain Types
// All data is simulated. No real IoT or GIS data.
// ============================================================

export type AlgorithmMode = 'NORMAL' | 'CONGESTION' | 'EMERGENCY' | 'NETWORK_OVERLOAD';
export type SignalPhase = 'RED' | 'YELLOW' | 'GREEN';
export type VehicleState = 'NORMAL' | 'WAITING' | 'REROUTING' | 'EMERGENCY' | 'COMPLETED';
export type RoadStatus = 'CLEAR' | 'MODERATE' | 'CONGESTED' | 'BLOCKED' | 'EMERGENCY_ROUTE';
export type ScenarioType = 'NORMAL' | 'RUSH_HOUR' | 'MAJOR_CONGESTION' | 'ROAD_ACCIDENT' | 'EMERGENCY' | 'NETWORK_OVERLOAD';
export type SimulationMode = 'MA_TRSN' | 'STATIC_BASELINE';

// --- Junction (Node) ---
export interface Junction {
  id: string;
  name: string;
  shortName: string;
  x: number;
  y: number;
  /** Geographic coordinates when the junction comes from OSM. */
  lat?: number;
  lon?: number;
  isHospital: boolean;

  // Signal state
  signalPhase: SignalPhase;
  signalTimer: number;       // seconds remaining in current phase
  signalCycleTime: number;   // total cycle time
  currentGreenDirection: 'NS' | 'EW';

  // Queues per direction (simulated vehicle count)
  queueNorth: number;
  queueSouth: number;
  queueEast: number;
  queueWest: number;

  // Metrics
  congestionLevel: number;   // 0.0–1.0
  vehiclesPassing: number;   // vehicles through this tick
  vehiclesWaiting: number;

  // Adaptive signal
  adaptiveGreenNS: number;   // seconds
  adaptiveGreenEW: number;
  fixedGreen: number;        // static baseline

  // State flags
  isGreenCorridor: boolean;
  isSelected: boolean;
}

// --- Road (Edge) ---
export interface Road {
  id: string;
  from: string;      // junction id
  to: string;        // junction id
  bidirectional: boolean;

  // Physical properties
  distance: number;  // km (simulated)
  lanes: number;

  // Dynamic traffic metrics (simulated)
  vehicleCount: number;
  capacity: number;
  congestionLevel: number;   // 0.0–1.0
  averageSpeed: number;      // km/h
  travelTime: number;        // minutes
  trafficCost: number;       // computed edge weight for algorithms

  // Status
  status: RoadStatus;
  isBlocked: boolean;

  // For animation: vehicles currently traversing
  activeVehicleIds: string[];
}

// --- Vehicle ---
export interface Vehicle {
  id: string;
  type: 'CAR' | 'BUS' | 'AMBULANCE';
  origin: string;          // junction id
  destination: string;     // junction id
  route: string[];         // ordered junction ids
  currentJunction: string; // current junction id
  nextJunction: string;    // next junction id
  progress: number;        // 0.0–1.0 along current edge
  speed: number;           // normalized units per tick
  state: VehicleState;

  // Metrics
  totalDistance: number;
  totalTime: number;       // ticks
  waitTime: number;
  rerouted: boolean;
  rerouteCount: number;

  // Position for rendering
  x: number;
  y: number;
}

// --- Algorithm Execution Result ---
export interface AlgorithmResult {
  algorithm: 'DIJKSTRA' | 'ASTAR' | 'ADAPTIVE_SIGNAL' | 'ACO';
  timestamp: number;
  reason: string;
  routesRecalculated?: number;
  path?: string[];
  cost?: number;
  travelTime?: number;
  acoDistribution?: RouteDistribution[];
}

export interface RouteDistribution {
  routeId: string;
  routeLabel: string;
  beforeLoad: number;   // 0–100%
  afterLoad: number;
}

// --- Event Log Entry ---
export interface LogEntry {
  id: string;
  timestamp: number;    // simulation time in seconds
  realTime: string;     // HH:MM:SS
  type: 'INFO' | 'ALGORITHM' | 'EMERGENCY' | 'WARNING' | 'SUCCESS';
  message: string;
}

// --- Metrics Snapshot ---
export interface MetricsSnapshot {
  tick: number;
  avgTravelTime: number;
  avgWaitTime: number;
  vehiclesCompleted: number;
  vehiclesRerouted: number;
  congestedJunctions: number;
  totalQueueLength: number;
  activeVehicles: number;
  blockedRoads: number;
  emergencyResponseTime: number;
  avgRoadUtilization: number;
}

// --- Comparison Data ---
export interface ComparisonData {
  staticBaseline: MetricsSnapshot[];
  maTraffic: MetricsSnapshot[];
}

// --- Simulation Settings ---
export interface SimulationSettings {
  spawnRate: number;         // vehicles per tick
  trafficDensity: number;    // 0.0–1.0 multiplier
  congestionSeverity: number;
  speed: number;             // 0.5 | 1 | 2 | 4
  scenario: ScenarioType;
  simulationMode: SimulationMode;
}

// --- Full Simulation State ---
export interface SimulationState {
  // Control
  isRunning: boolean;
  tick: number;
  simTimeSeconds: number;

  // Network
  junctions: Record<string, Junction>;
  roads: Record<string, Road>;
  vehicles: Record<string, Vehicle>;

  // Algorithm
  mode: AlgorithmMode;
  activeAlgorithm: AlgorithmResult | null;
  lastAlgorithmRun: number;

  // Emergency
  activeEmergencyVehicleId: string | null;
  greenCorridorJunctions: string[];
  greenCorridorRoads: string[];

  // UI Selection
  selectedJunctionId: string | null;
  selectedRoadId: string | null;

  // Metrics
  metrics: MetricsSnapshot;
  metricsHistory: MetricsSnapshot[];
  comparisonData: ComparisonData;

  // ACO
  acoDistribution: RouteDistribution[];

  // Log
  eventLog: LogEntry[];

  // Settings
  settings: SimulationSettings;

  // Demo mode
  demoMode: boolean;
  demoPhase: number;
}

// --- Graph helper types for algorithms ---
export interface GraphNode {
  id: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  cost: number;
  isBlocked: boolean;
}
