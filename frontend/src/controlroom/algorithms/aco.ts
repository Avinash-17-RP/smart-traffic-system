// ============================================================
// ANT COLONY OPTIMIZATION (ACO) — Load Balancing
// Used when situation = NETWORK_OVERLOAD
// Distributes traffic across multiple paths using pheromone trails.
// Objective: balance load, NOT just minimize distance.
// ============================================================

import type { Road } from '../types';
import { buildAdjacency, computeEdgeCost, getRoadBetween } from '../data/network';
import type { RouteDistribution } from '../types';

// ACO Parameters
const ALPHA = 1.0;    // pheromone importance
const BETA = 2.0;     // heuristic importance (1/cost)
const RHO = 0.3;      // evaporation rate
const Q = 10.0;       // pheromone deposit amount
const NUM_ANTS = 8;
const ITERATIONS = 4;
const INITIAL_PHEROMONE = 1.0;

export interface ACOResult {
  distribution: RouteDistribution[];
  bestPath: string[];
  totalIterations: number;
  converged: boolean;
}

interface AntPath {
  path: string[];
  cost: number;
}

/**
 * Find all simple paths from start to end up to maxDepth hops.
 * Returns up to `maxPaths` candidate paths.
 */
function findCandidatePaths(
  roads: Record<string, Road>,
  start: string,
  end: string,
  maxDepth: number = 8,
  maxPaths: number = 5
): string[][] {
  const results: string[][] = [];
  const adjacency = buildAdjacency(roads);
  const stack: { path: string[]; visited: Set<string> }[] = [
    { path: [start], visited: new Set([start]) },
  ];

  while (stack.length > 0 && results.length < maxPaths) {
    const { path, visited } = stack.pop()!;
    const current = path[path.length - 1];

    if (current === end) {
      results.push([...path]);
      continue;
    }

    if (path.length >= maxDepth) continue;

    for (const neighbor of adjacency[current] ?? []) {
      if (!visited.has(neighbor)) {
        const nextPath = [...path, neighbor];
        const nextVisited = new Set(visited);
        nextVisited.add(neighbor);
        stack.push({ path: nextPath, visited: nextVisited });
      }
    }
  }

  return results;
}

/**
 * Compute cost of a full path.
 */
function pathCost(path: string[], roads: Record<string, Road>): number {
  let cost = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const road = getRoadBetween(roads, path[i], path[i + 1]);
    if (!road || road.isBlocked) return Infinity;
    cost += computeEdgeCost(road);
  }
  return cost;
}

/**
 * Run ACO load balancing for a set of OD pairs.
 * Returns traffic distribution before and after rebalancing.
 */
export function runACO(
  junctionIds: string[],
  roads: Record<string, Road>,
  odPairs: [string, string][]  // Origin-Destination pairs to balance
): ACOResult {
  if (odPairs.length === 0) {
    return { distribution: [], bestPath: [], totalIterations: 0, converged: false };
  }

  // Pick the first OD pair as the primary route to optimize
  const [start, end] = odPairs[0];

  // Find candidate paths
  const candidatePaths = findCandidatePaths(roads, start, end, 7, 5);

  if (candidatePaths.length === 0) {
    return { distribution: [], bestPath: [], totalIterations: 0, converged: false };
  }

  if (candidatePaths.length === 1) {
    const dist: RouteDistribution[] = [{
      routeId: 'Route-A',
      routeLabel: formatPathLabel(candidatePaths[0]),
      beforeLoad: 100,
      afterLoad: 100,
    }];
    return { distribution: dist, bestPath: candidatePaths[0], totalIterations: 1, converged: true };
  }

  // Initialize pheromone on each candidate path
  const pheromones: number[] = candidatePaths.map(() => INITIAL_PHEROMONE);

  // Compute base costs for each path
  const costs = candidatePaths.map(p => pathCost(p, roads));

  // Simulate "before" load: proportional to 1/cost (greedy baseline)
  const invCostSum = costs.reduce((s, c) => s + (c < Infinity ? 1 / c : 0), 0);
  const beforeLoad = costs.map(c =>
    c < Infinity ? Math.round((1 / c) / invCostSum * 100) : 0
  );

  // Run ACO iterations
  let bestPath = candidatePaths[0];
  let bestCost = costs[0];

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const antPaths: AntPath[] = [];

    // Each ant constructs a path
    for (let ant = 0; ant < NUM_ANTS; ant++) {
      // Select path probabilistically based on pheromone and heuristic
      const probs = candidatePaths.map((_, i) => {
        if (costs[i] >= Infinity) return 0;
        const tau = Math.pow(pheromones[i], ALPHA);
        const eta = Math.pow(1 / costs[i], BETA);
        return tau * eta;
      });
      const probSum = probs.reduce((s, p) => s + p, 0);
      const normalizedProbs = probs.map(p => p / (probSum || 1));

      // Roulette wheel selection
      let rand = Math.random();
      let selectedIdx = 0;
      for (let i = 0; i < normalizedProbs.length; i++) {
        rand -= normalizedProbs[i];
        if (rand <= 0) { selectedIdx = i; break; }
        if (i === normalizedProbs.length - 1) selectedIdx = i;
      }

      antPaths.push({ path: candidatePaths[selectedIdx], cost: costs[selectedIdx] });
      if (costs[selectedIdx] < bestCost) {
        bestCost = costs[selectedIdx];
        bestPath = candidatePaths[selectedIdx];
      }
    }

    // Evaporate pheromones
    for (let i = 0; i < pheromones.length; i++) {
      pheromones[i] *= (1 - RHO);
    }

    // Deposit pheromones from ant paths
    for (const { path, cost } of antPaths) {
      const idx = candidatePaths.findIndex(p => p.join(',') === path.join(','));
      if (idx >= 0 && cost < Infinity) {
        pheromones[idx] += Q / cost;
      }
    }
  }

  // Compute "after" load distribution from final pheromone levels
  const pheroSum = pheromones.reduce((s, p) => s + p, 0);
  const afterLoad = pheromones.map(p =>
    Math.round((p / pheroSum) * 100)
  );

  // Normalize to sum to ~100%
  const labels = ['Route A', 'Route B', 'Route C', 'Route D', 'Route E'];
  const distribution: RouteDistribution[] = candidatePaths.map((path, i) => ({
    routeId: `Route-${String.fromCharCode(65 + i)}`,
    routeLabel: formatPathLabel(path),
    beforeLoad: beforeLoad[i] ?? 0,
    afterLoad: afterLoad[i] ?? 0,
  }));

  return {
    distribution,
    bestPath,
    totalIterations: ITERATIONS,
    converged: true,
  };
}

function formatPathLabel(path: string[]): string {
  if (path.length <= 3) return path.join(' → ');
  return `${path[0]} → ... → ${path[path.length - 1]} (${path.length} hops)`;
}

/**
 * Generate a set of high-traffic OD pairs from current network state.
 */
export function getHighTrafficODPairs(
  roads: Record<string, Road>,
  count: number = 3
): [string, string][] {
  const sortedRoads = Object.values(roads)
    .filter(r => !r.isBlocked)
    .sort((a, b) => b.vehicleCount - a.vehicleCount);

  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const road of sortedRoads) {
    const key = `${road.from}-${road.to}`;
    if (!seen.has(key) && pairs.length < count) {
      seen.add(key);
      pairs.push([road.from, road.to]);
    }
  }
  return pairs;
}
