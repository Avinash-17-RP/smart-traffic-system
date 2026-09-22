const db = require('./database');

function startSimulation(io) {
  setInterval(() => {
    tick(io);
  }, 5000);
}

function tick(io) {
  const edges = db.prepare('SELECT * FROM edges').all();
  const updateEdge = db.prepare('UPDATE edges SET congestion_weight = ? WHERE source = ? AND target = ?');
  
  let activeHotspots = 0;
  
  edges.forEach(e => {
    let change = (Math.random() * 3) - 1;
    let newCongestion = Math.max(0, e.congestion_weight + change);
    
    if (newCongestion > 0) newCongestion -= 0.2;
    if (newCongestion < 0) newCongestion = 0;
    
    if (newCongestion > 15) newCongestion = 15;
    if (newCongestion > 5) activeHotspots++;

    updateEdge.run(newCongestion, e.source, e.target);
  });

  if (Math.random() < 0.1) {
    const randomEdge = edges[Math.floor(Math.random() * edges.length)];
    updateEdge.run(Math.min(15, randomEdge.congestion_weight + 10), randomEdge.source, randomEdge.target);
    activeHotspots++;
  }

  const updateJunction = db.prepare('UPDATE junctions SET queue_length = ? WHERE id = ?');
  const junctions = db.prepare('SELECT * FROM junctions').all();
  
  let totalQueue = 0;
  junctions.forEach(j => {
    let qChange = Math.floor(Math.random() * 5) - 2;
    let newQ = Math.max(0, j.queue_length + qChange);
    
    if (j.mode === 'adaptive' && newQ > 10) {
       newQ -= 2;
    }
    
    totalQueue += newQ;
    updateJunction.run(newQ, j.id);
  });

  const avgWaitTime = totalQueue / junctions.length;
  const vehiclesSimulated = Math.floor(totalQueue * 3.5);
  
  db.prepare('INSERT INTO history (avg_wait_time, active_hotspots, vehicles_simulated) VALUES (?, ?, ?)')
    .run(avgWaitTime, activeHotspots, vehiclesSimulated);

  io.emit('graph:update', { timestamp: Date.now() });
  io.emit('dashboard:update', {
    avgCityWaitTime: avgWaitTime.toFixed(1),
    activeHotspots,
    vehiclesSimulated,
    timestamp: Date.now()
  });
}

module.exports = { startSimulation, tick };
