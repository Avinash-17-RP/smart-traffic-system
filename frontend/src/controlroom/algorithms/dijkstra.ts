// ============================================================
// DIJKSTRA'S ALGORITHM
// Traffic-aware shortest path over the real OSM road graph.
// ============================================================

import type { Road } from '../types';
import { ROAD_ADJACENCY, computeEdgeCost, getRoadBetween } from '../data/network';

export interface DijkstraResult {
  path: string[];
  totalCost: number;
  estimatedTravelTime: number;
  found: boolean;
}

class MinHeap {
  private items: { id: string; cost: number }[] = [];
  push(item: { id: string; cost: number }) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.items[p].cost <= this.items[i].cost) break;
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
        if (l < this.items.length && this.items[l].cost < this.items[smallest].cost) smallest = l;
        if (r < this.items.length && this.items[r].cost < this.items[smallest].cost) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return root;
  }
  get size() { return this.items.length; }
}

export function dijkstra(
  junctionIds: string[] | Record<string, any>,
  roads: Record<string, Road>,
  start: string,
  end: string
): DijkstraResult {
  if (start === end) return { path: [start], totalCost: 0, estimatedTravelTime: 0, found: true };
  if (!roads || (!ROAD_ADJACENCY[start] && start !== end) || (!ROAD_ADJACENCY[end] && end !== start)) {
    return { path: [], totalCost: Infinity, estimatedTravelTime: Infinity, found: false };
  }

  const adjacency = ROAD_ADJACENCY;
  // Lazy maps avoid allocating 80k+ distance entries for every vehicle reroute.
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  dist.set(start, 0);

  const pq = new MinHeap();
  pq.push({ id: start, cost: 0 });

  while (pq.size) {
    const current = pq.pop()!;
    const u = current.id;
    if (current.cost !== (dist.get(u) ?? Infinity)) continue;
    if (u === end) break;

    for (const v of adjacency[u] ?? []) {
      const road = getRoadBetween(roads, u, v);
      if (!road || road.isBlocked) continue;
      const nextCost = (dist.get(u) ?? Infinity) + computeEdgeCost(road);
      if (nextCost < (dist.get(v) ?? Infinity)) {
        dist.set(v, nextCost);
        prev.set(v, u);
        pq.push({ id: v, cost: nextCost });
      }
    }
  }

  const endCost = dist.get(end) ?? Infinity;
  if (endCost === Infinity) return { path: [], totalCost: Infinity, estimatedTravelTime: Infinity, found: false };

  const path: string[] = [];
  let current: string | null = end;
  while (current !== null) { path.unshift(current); current = prev.get(current) ?? null; }

  let travelTime = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const road = getRoadBetween(roads, path[i], path[i + 1]);
    if (road) travelTime += road.travelTime;
  }

  return { path, totalCost: endCost, estimatedTravelTime: travelTime, found: true };
}
