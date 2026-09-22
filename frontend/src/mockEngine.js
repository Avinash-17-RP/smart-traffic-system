// Standalone In-Memory Simulation & Graph Algorithm Engine for Netlify Deployment
// Allows 100% full-stack operation in-browser without requiring an external backend server.

const INITIAL_JUNCTIONS = [
  { id: 'j1', name: 'Gandhipuram', x: 50, y: 30, mode: 'fixed', queue_length: 12, signal_phase: 'red', green_time: 30 },
  { id: 'j2', name: 'Town Hall', x: 30, y: 60, mode: 'fixed', queue_length: 8, signal_phase: 'green', green_time: 30 },
  { id: 'j3', name: 'RS Puram', x: 20, y: 40, mode: 'adaptive', queue_length: 4, signal_phase: 'red', green_time: 25 },
  { id: 'j4', name: 'Ukkadam', x: 30, y: 80, mode: 'fixed', queue_length: 18, signal_phase: 'red', green_time: 30 },
  { id: 'j5', name: 'Race Course', x: 60, y: 60, mode: 'adaptive', queue_length: 5, signal_phase: 'green', green_time: 35 },
  { id: 'j6', name: 'Avinashi Road', x: 80, y: 40, mode: 'fixed', queue_length: 15, signal_phase: 'red', green_time: 30 },
  { id: 'j7', name: 'Peelamedu', x: 100, y: 30, mode: 'fixed', queue_length: 6, signal_phase: 'green', green_time: 30 },
  { id: 'j8', name: 'Hopes College', x: 120, y: 20, mode: 'adaptive', queue_length: 9, signal_phase: 'red', green_time: 20 },
  { id: 'j9', name: 'Lakshmi Mills', x: 70, y: 50, mode: 'fixed', queue_length: 7, signal_phase: 'green', green_time: 30 },
  { id: 'j10', name: 'Trichy Road Junction', x: 70, y: 70, mode: 'fixed', queue_length: 11, signal_phase: 'red', green_time: 30 },
  { id: 'j11', name: 'Singanallur', x: 100, y: 80, mode: 'fixed', queue_length: 14, signal_phase: 'red', green_time: 30 },
  { id: 'j12', name: 'Big Bazaar Street', x: 40, y: 65, mode: 'adaptive', queue_length: 3, signal_phase: 'green', green_time: 30 }
];

const INITIAL_EDGES = [
  { source: 'j1', target: 'j3', base_weight: 4, congestion_weight: 2 },
  { source: 'j3', target: 'j1', base_weight: 4, congestion_weight: 2 },
  { source: 'j1', target: 'j6', base_weight: 5, congestion_weight: 5 },
  { source: 'j6', target: 'j1', base_weight: 5, congestion_weight: 5 },
  { source: 'j6', target: 'j7', base_weight: 3, congestion_weight: 1 },
  { source: 'j7', target: 'j6', base_weight: 3, congestion_weight: 1 },
  { source: 'j7', target: 'j8', base_weight: 3, congestion_weight: 3 },
  { source: 'j8', target: 'j7', base_weight: 3, congestion_weight: 3 },
  { source: 'j1', target: 'j9', base_weight: 3, congestion_weight: 2 },
  { source: 'j9', target: 'j1', base_weight: 3, congestion_weight: 2 },
  { source: 'j9', target: 'j6', base_weight: 2, congestion_weight: 1 },
  { source: 'j6', target: 'j9', base_weight: 2, congestion_weight: 1 },
  { source: 'j9', target: 'j5', base_weight: 2, congestion_weight: 0 },
  { source: 'j5', target: 'j9', base_weight: 2, congestion_weight: 0 },
  { source: 'j5', target: 'j10', base_weight: 2, congestion_weight: 4 },
  { source: 'j10', target: 'j5', base_weight: 2, congestion_weight: 4 },
  { source: 'j10', target: 'j11', base_weight: 5, congestion_weight: 6 },
  { source: 'j11', target: 'j10', base_weight: 5, congestion_weight: 6 },
  { source: 'j5', target: 'j2', base_weight: 4, congestion_weight: 2 },
  { source: 'j2', target: 'j5', base_weight: 4, congestion_weight: 2 },
  { source: 'j3', target: 'j2', base_weight: 3, congestion_weight: 1 },
  { source: 'j2', target: 'j3', base_weight: 3, congestion_weight: 1 },
  { source: 'j2', target: 'j12', base_weight: 1, congestion_weight: 0 },
  { source: 'j12', target: 'j2', base_weight: 1, congestion_weight: 0 },
  { source: 'j12', target: 'j4', base_weight: 2, congestion_weight: 3 },
  { source: 'j4', target: 'j12', base_weight: 2, congestion_weight: 3 },
  { source: 'j2', target: 'j4', base_weight: 3, congestion_weight: 5 },
  { source: 'j4', target: 'j2', base_weight: 3, congestion_weight: 5 },
  { source: 'j10', target: 'j4', base_weight: 5, congestion_weight: 4 },
  { source: 'j4', target: 'j10', base_weight: 5, congestion_weight: 4 }
];

class PriorityQueue {
  constructor() { this.items = []; }
  enqueue(element, priority) {
    let contain = false;
    const qElement = { element, priority };
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].priority > qElement.priority) {
        this.items.splice(i, 0, qElement);
        contain = true;
        break;
      }
    }
    if (!contain) { this.items.push(qElement); }
  }
  dequeue() { return this.items.shift(); }
  isEmpty() { return this.items.length === 0; }
}

class MockSocketEmitter {
  constructor() {
    this.listeners = {};
  }
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

export const mockSocket = new MockSocketEmitter();

class MockEngine {
  constructor() {
    this.junctions = JSON.parse(JSON.stringify(INITIAL_JUNCTIONS));
    this.edges = JSON.parse(JSON.stringify(INITIAL_EDGES));
    this.dispatchLogs = [
      { id: 1, timestamp: new Date(Date.now() - 120000).toISOString(), source_id: 'j1', target_id: 'j5', eta_corridor: 6, eta_normal: 14 },
      { id: 2, timestamp: new Date(Date.now() - 300000).toISOString(), source_id: 'j4', target_id: 'j8', eta_corridor: 10, eta_normal: 22 }
    ];
    this.history = [];
    this.startSimulation();
  }

  getGraph() {
    return { junctions: this.junctions, edges: this.edges };
  }

  calculateShortestPath(startId, endId) {
    const adjList = {};
    this.junctions.forEach(j => { adjList[j.id] = []; });
    this.edges.forEach(e => {
      const currentWeight = e.base_weight + e.congestion_weight;
      if (adjList[e.source]) {
        adjList[e.source].push({ node: e.target, weight: currentWeight, base: e.base_weight });
      }
    });

    const distances = {};
    const previous = {};
    const pq = new PriorityQueue();

    this.junctions.forEach(j => {
      distances[j.id] = Infinity;
      previous[j.id] = null;
    });

    distances[startId] = 0;
    pq.enqueue(startId, 0);

    while (!pq.isEmpty()) {
      const minNode = pq.dequeue().element;
      if (minNode === endId) break;

      if (adjList[minNode]) {
        adjList[minNode].forEach(neighbor => {
          const alt = distances[minNode] + neighbor.weight;
          if (alt < distances[neighbor.node]) {
            distances[neighbor.node] = alt;
            previous[neighbor.node] = minNode;
            pq.enqueue(neighbor.node, alt);
          }
        });
      }
    }

    const path = [];
    let u = endId;
    while (previous[u]) {
      path.unshift(u);
      u = previous[u];
    }
    if (distances[endId] !== Infinity) {
      path.unshift(startId);
    }

    let totalDistance = 0;
    let totalCost = distances[endId] === Infinity ? 0 : distances[endId];

    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.edges.find(e => e.source === path[i] && e.target === path[i + 1]);
      if (edge) totalDistance += edge.base_weight;
    }

    const fullPath = path.map(id => this.junctions.find(j => j.id === id)).filter(Boolean);
    return { path: fullPath, totalCost: totalCost.toFixed(2), totalDistance, etaMinutes: Math.round(totalCost * 2) };
  }

  calculateEmergencyPath(startId, endId) {
    const dijk = this.calculateShortestPath(startId, endId);
    const path = dijk.path.map(j => j.id);

    const etaWithCorridor = Math.round((dijk.totalDistance || 5) * 1.5);
    const etaWithoutCorridor = Math.round(parseFloat(dijk.totalCost) * 2);

    const logEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      source_id: startId,
      target_id: endId,
      eta_corridor: etaWithCorridor,
      eta_normal: etaWithoutCorridor
    };
    this.dispatchLogs.unshift(logEntry);

    mockSocket.emit('emergency:started', { path, timestamp: Date.now() });

    setTimeout(() => {
      mockSocket.emit('emergency:cleared', { timestamp: Date.now() });
    }, 15000);

    return {
      path: dijk.path,
      greenCorridorJunctions: path,
      etaWithCorridor,
      etaWithoutCorridor
    };
  }

  calculateLoadBalance(startId, endId, vehicleCount = 100) {
    const dijk = this.calculateShortestPath(startId, endId);
    const primaryCost = parseFloat(dijk.totalCost) || 10;
    
    return [
      { id: 'path-0', path: dijk.path, percentage: 60, vehicles: Math.round(vehicleCount * 0.6), cost: primaryCost.toFixed(2) },
      { id: 'path-1', path: dijk.path.slice().reverse(), percentage: 40, vehicles: Math.round(vehicleCount * 0.4), cost: (primaryCost * 1.25).toFixed(2) }
    ];
  }

  setJunctionMode(id, mode) {
    const j = this.junctions.find(j => j.id === id);
    if (j) {
      j.mode = mode;
      mockSocket.emit('junction:update', j);
      return { success: true, mode };
    }
    return { error: 'Not found' };
  }

  getDashboardStats() {
    let totalQueue = 0;
    let hotspots = 0;
    this.junctions.forEach(j => {
      totalQueue += j.queue_length;
      if (j.queue_length > 10) hotspots++;
    });

    const avgWait = (totalQueue * 2.5 / (this.junctions.length || 1)).toFixed(1);
    const vehiclesSimulated = Math.round(totalQueue * 3.5);

    const adaptiveCount = this.junctions.filter(j => j.mode === 'adaptive').length;
    const fixedCount = this.junctions.filter(j => j.mode === 'fixed').length;

    return {
      avgCityWaitTime: avgWait,
      activeHotspots: hotspots,
      vehiclesSimulated,
      emergenciesActive: 0,
      comparisonFixedVsAdaptive: `Fixed: ${fixedCount} | Adaptive: ${adaptiveCount}`
    };
  }

  getDashboardHistory() {
    if (this.history.length === 0) {
      const now = Date.now();
      for (let i = 20; i >= 0; i--) {
        this.history.push({
          id: 21 - i,
          timestamp: new Date(now - i * 30000).toISOString(),
          avg_wait_time: +(15 + Math.sin(i) * 5).toFixed(1),
          active_hotspots: Math.floor(2 + Math.random() * 3),
          vehicles_simulated: Math.floor(120 + Math.random() * 40)
        });
      }
    }
    return this.history;
  }

  getDispatchLog() {
    return this.dispatchLogs;
  }

  startSimulation() {
    setInterval(() => {
      // Tick simulation: Update queue length & congestion weights
      this.junctions.forEach(j => {
        const delta = Math.floor(Math.random() * 5) - 2;
        j.queue_length = Math.max(1, Math.min(30, j.queue_length + delta));
        if (j.mode === 'adaptive' && j.queue_length > 8) {
          j.queue_length = Math.max(1, j.queue_length - 2); // adaptive drains faster
        }
      });

      this.edges.forEach(e => {
        const delta = Math.floor(Math.random() * 3) - 1;
        e.congestion_weight = Math.max(0, Math.min(15, e.congestion_weight + delta));
      });

      const stats = this.getDashboardStats();

      this.history.push({
        id: this.history.length + 1,
        timestamp: new Date().toISOString(),
        avg_wait_time: +stats.avgCityWaitTime,
        active_hotspots: stats.activeHotspots,
        vehicles_simulated: stats.vehiclesSimulated
      });
      if (this.history.length > 50) this.history.shift();

      mockSocket.emit('graph:update', this.getGraph());
      mockSocket.emit('dashboard:update', stats);
    }, 5000);
  }
}

export const mockEngine = new MockEngine();
