const db = require('./database');

function getGraph() {
  const junctions = db.prepare('SELECT * FROM junctions').all();
  const edges = db.prepare('SELECT * FROM edges').all();
  return { junctions, edges };
}

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

function calculateShortestPath(startId, endId) {
  const { junctions, edges } = getGraph();
  const adjList = {};
  
  junctions.forEach(j => { adjList[j.id] = []; });
  edges.forEach(e => {
    const currentWeight = e.base_weight + e.congestion_weight;
    adjList[e.source].push({ node: e.target, weight: currentWeight, base: e.base_weight });
  });

  const distances = {};
  const previous = {};
  const pq = new PriorityQueue();

  junctions.forEach(j => {
    distances[j.id] = Infinity;
    previous[j.id] = null;
  });
  
  distances[startId] = 0;
  pq.enqueue(startId, 0);

  while (!pq.isEmpty()) {
    const minNode = pq.dequeue().element;
    
    if (minNode === endId) break;

    adjList[minNode].forEach(neighbor => {
      const alt = distances[minNode] + neighbor.weight;
      if (alt < distances[neighbor.node]) {
        distances[neighbor.node] = alt;
        previous[neighbor.node] = minNode;
        pq.enqueue(neighbor.node, alt);
      }
    });
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
  
  for(let i=0; i<path.length-1; i++) {
     const edge = edges.find(e => e.source === path[i] && e.target === path[i+1]);
     if(edge) totalDistance += edge.base_weight;
  }

  const fullPath = path.map(id => junctions.find(j => j.id === id));
  return { path: fullPath, totalCost: totalCost.toFixed(2), totalDistance, etaMinutes: Math.round(totalCost * 2) };
}

function calculateEmergencyPath(startId, endId) {
  const { junctions, edges } = getGraph();
  
  const getHeuristic = (node1, node2) => {
    const j1 = junctions.find(j => j.id === node1);
    const j2 = junctions.find(j => j.id === node2);
    return Math.sqrt(Math.pow(j1.x - j2.x, 2) + Math.pow(j1.y - j2.y, 2)) / 10;
  };

  const adjList = {};
  junctions.forEach(j => { adjList[j.id] = []; });
  edges.forEach(e => {
    const currentWeight = e.base_weight + e.congestion_weight;
    adjList[e.source].push({ node: e.target, weight: currentWeight, base: e.base_weight });
  });

  const gScore = {};
  const fScore = {};
  const previous = {};
  const pq = new PriorityQueue();

  junctions.forEach(j => {
    gScore[j.id] = Infinity;
    fScore[j.id] = Infinity;
    previous[j.id] = null;
  });

  gScore[startId] = 0;
  fScore[startId] = getHeuristic(startId, endId);
  pq.enqueue(startId, fScore[startId]);

  while (!pq.isEmpty()) {
    const current = pq.dequeue().element;
    
    if (current === endId) break;

    adjList[current].forEach(neighbor => {
      const tentative_gScore = gScore[current] + neighbor.weight;
      if (tentative_gScore < gScore[neighbor.node]) {
        previous[neighbor.node] = current;
        gScore[neighbor.node] = tentative_gScore;
        fScore[neighbor.node] = gScore[neighbor.node] + getHeuristic(neighbor.node, endId);
        pq.enqueue(neighbor.node, fScore[neighbor.node]);
      }
    });
  }

  const path = [];
  let u = endId;
  while (previous[u]) {
    path.unshift(u);
    u = previous[u];
  }
  if (gScore[endId] !== Infinity) {
    path.unshift(startId);
  }

  const fullPath = path.map(id => junctions.find(j => j.id === id));
  
  // baseCost = corridor ETA (base weights only, no congestion — lights are green)
  let baseCost = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = edges.find(e => e.source === path[i] && e.target === path[i + 1]);
    if (edge) baseCost += edge.base_weight;
  }

  // normalCost = what Dijkstra gives with full congestion weights (realistic comparison)
  const dijkResult = calculateShortestPath(startId, endId);
  const normalCost = parseFloat(dijkResult.totalCost);

  return {
    path: fullPath,
    greenCorridorJunctions: path,
    etaWithCorridor: Math.round(baseCost * 2),
    etaWithoutCorridor: Math.round(normalCost * 2)
  };
}

function calculateLoadBalance(startId, endId, vehicleCount) {
  const { junctions, edges } = getGraph();
  const adjList = {};
  junctions.forEach(j => { adjList[j.id] = []; });
  edges.forEach(e => {
    adjList[e.source].push({ node: e.target, weight: e.base_weight + e.congestion_weight });
  });

  const paths = [];
  
  function dfs(current, currentPath, currentCost) {
    if (paths.length >= 3) return;
    if (current === endId) {
      paths.push({ path: [...currentPath], cost: currentCost });
      return;
    }
    
    adjList[current].forEach(neighbor => {
      if (!currentPath.includes(neighbor.node)) {
        currentPath.push(neighbor.node);
        dfs(neighbor.node, currentPath, currentCost + neighbor.weight);
        currentPath.pop();
      }
    });
  }

  dfs(startId, [startId], 0);
  
  paths.sort((a, b) => a.cost - b.cost);

  const totalInverseCost = paths.reduce((sum, p) => sum + (1 / p.cost), 0);
  
  return paths.map((p, idx) => {
    const percentage = Math.round(((1 / p.cost) / totalInverseCost) * 100);
    return {
      id: `path-${idx}`,
      path: p.path.map(id => junctions.find(j => j.id === id)),
      percentage,
      vehicles: Math.round((percentage / 100) * vehicleCount),
      cost: p.cost.toFixed(2)
    };
  });
}

module.exports = {
  getGraph,
  calculateShortestPath,
  calculateEmergencyPath,
  calculateLoadBalance
};
