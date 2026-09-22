// ============================================================
// A* SEARCH ALGORITHM
// Emergency routing over the real OSM road graph.
// ============================================================

import type { Junction, Road } from '../types';
import { ROAD_ADJACENCY, getRoadBetween } from '../data/network';

export interface AStarResult {
  path: string[];
  totalCost: number;
  estimatedTravelTime: number;
  found: boolean;
}

function haversineKm(a: Junction, b: Junction): number {
  if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const lat1 = a.lat * rad, lat2 = b.lat * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) * 0.03;
}

class MinHeap {
  private items: { id: string; score: number }[] = [];
  push(item: { id: string; score: number }) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.items[p].score <= this.items[i].score) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop() {
    if (!this.items.length) return undefined;
    const root = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.items[l].score < this.items[smallest].score) smallest = l;
        if (r < this.items.length && this.items[r].score < this.items[smallest].score) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return root;
  }
  get size() { return this.items.length; }
}

/**
 * Emergency A* cost function — strongly differentiated from Dijkstra:
 * 1. Congestion penalty is 10x (vs Dijkstra's 3x) — ambulances MUST avoid jammed roads
 * 2. Multi-lane roads are preferred (cost is divided by lane count)
 * 3. Blocked roads get infinite cost
 */
function emergencyEdgeCost(road: Road): number {
  if (road.isBlocked) return 999999;
  // Heavy congestion avoidance + lane preference
  const congestionPenalty = 1 + road.congestionLevel * 10;
  const laneFactor = Math.max(1, road.lanes); // wider roads = cheaper
  return (road.distance * congestionPenalty) / laneFactor;
}

export function astar(
  junctions: Record<string, Junction>,
  roads: Record<string, Road>,
  start: string,
  end: string
): AStarResult {
  if (start === end) return { path: [start], totalCost: 0, estimatedTravelTime: 0, found: true };
  const startJ = junctions[start], endJ = junctions[end];
  if (!startJ || !endJ) return { path: [], totalCost: Infinity, estimatedTravelTime: Infinity, found: false };

  const adjacency = ROAD_ADJACENCY;
  const g = new Map<string, number>();
  const cameFrom = new Map<string, string | null>();
  const closed = new Set<string>();
  g.set(start, 0);

  const open = new MinHeap();
  open.push({ id: start, score: haversineKm(startJ, endJ) });

  while (open.size) {
    const currentItem = open.pop()!;
    const current = currentItem.id;
    if (closed.has(current)) continue;
    if (current === end) break;
    closed.add(current);

    for (const neighbor of adjacency[current] ?? []) {
      if (closed.has(neighbor)) continue;
      const road = getRoadBetween(roads, current, neighbor);
      if (!road || road.isBlocked) continue;

      const cost = emergencyEdgeCost(road);
      const tentative = (g.get(current) ?? Infinity) + cost;
      if (tentative < (g.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, current);
        g.set(neighbor, tentative);
        // A* heuristic: straight-line distance to goal with aggressive underestimate factor (0.8)
        const h = haversineKm(junctions[neighbor], endJ) * 0.8;
        open.push({ id: neighbor, score: tentative + h });
      }
    }
  }

  const endCost = g.get(end) ?? Infinity;
  if (endCost === Infinity) return { path: [], totalCost: Infinity, estimatedTravelTime: Infinity, found: false };

  const path: string[] = [];
  let node: string | null = end;
  while (node !== null) { path.unshift(node); node = cameFrom.get(node) ?? null; }

  // Emergency vehicles travel at ~1.5x normal speed (siren + green corridor)
  let travelTime = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const road = getRoadBetween(roads, path[i], path[i + 1]);
    if (road) travelTime += road.travelTime * 0.5;
  }

  return { path, totalCost: endCost, estimatedTravelTime: travelTime, found: true };
}
