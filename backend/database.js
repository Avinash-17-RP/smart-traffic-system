const path = require('path');

class InMemoryDB {
  constructor() {
    this.tables = {
      junctions: [],
      edges: [],
      history: [],
      dispatch_log: []
    };
    this.historyIdSeq = 1;
    this.dispatchIdSeq = 1;
  }

  exec(sql) {
    // Schema initialization handled programmatically
  }

  prepare(sql) {
    const self = this;
    const cleanSql = sql.trim().replace(/\s+/g, ' ');

    return {
      get(...params) {
        if (cleanSql.includes('SELECT COUNT(*) as c FROM junctions')) {
          return { c: self.tables.junctions.length };
        }
        if (cleanSql.includes('FROM junctions WHERE id =')) {
          const id = params[0];
          return self.tables.junctions.find(j => j.id === id) || null;
        }
        if (cleanSql.includes('FROM history ORDER BY timestamp DESC LIMIT 1')) {
          if (self.tables.history.length === 0) return null;
          return self.tables.history[self.tables.history.length - 1];
        }
        return null;
      },

      all(...params) {
        if (cleanSql.includes('FROM junctions GROUP BY mode')) {
          const counts = {};
          self.tables.junctions.forEach(j => {
            const m = j.mode || 'fixed';
            counts[m] = (counts[m] || 0) + 1;
          });
          return Object.keys(counts).map(m => ({ mode: m, c: counts[m] }));
        }
        if (cleanSql.includes('FROM junctions')) {
          return [...self.tables.junctions];
        }
        if (cleanSql.includes('FROM edges')) {
          return [...self.tables.edges];
        }
        if (cleanSql.includes('FROM history ORDER BY id DESC LIMIT')) {
          const limit = params[0] || 10;
          return [...self.tables.history].reverse().slice(0, limit);
        }
        if (cleanSql.includes('FROM dispatch_log ORDER BY timestamp DESC LIMIT')) {
          const limit = params[0] || 10;
          return [...self.tables.dispatch_log].reverse().slice(0, limit);
        }
        return [];
      },

      run(...params) {
        if (cleanSql.includes('INSERT INTO junctions')) {
          const [id, name, x, y] = params;
          self.tables.junctions.push({
            id, name, x, y,
            mode: 'fixed',
            queue_length: 0,
            signal_phase: 'red',
            green_time: 30
          });
        } else if (cleanSql.includes('INSERT INTO edges')) {
          const [source, target, weight] = params;
          self.tables.edges.push({
            source, target,
            base_weight: weight,
            congestion_weight: 0
          });
        } else if (cleanSql.includes('INSERT INTO dispatch_log')) {
          const [source_id, target_id, eta_corridor, eta_normal] = params;
          self.tables.dispatch_log.push({
            id: self.dispatchIdSeq++,
            timestamp: new Date().toISOString(),
            source_id, target_id, eta_corridor, eta_normal
          });
        } else if (cleanSql.includes('INSERT INTO history')) {
          const [avg_wait_time, active_hotspots, vehicles_simulated] = params;
          self.tables.history.push({
            id: self.historyIdSeq++,
            timestamp: new Date().toISOString(),
            avg_wait_time, active_hotspots, vehicles_simulated
          });
        } else if (cleanSql.includes('UPDATE junctions SET mode =')) {
          const [mode, id] = params;
          const j = self.tables.junctions.find(j => j.id === id);
          if (j) j.mode = mode;
        } else if (cleanSql.includes('UPDATE junctions SET queue_length =')) {
          const [q, id] = params;
          const j = self.tables.junctions.find(j => j.id === id);
          if (j) j.queue_length = q;
        } else if (cleanSql.includes('UPDATE edges SET congestion_weight =')) {
          const [cw, source, target] = params;
          const e = self.tables.edges.find(e => e.source === source && e.target === target);
          if (e) e.congestion_weight = cw;
        }
        return { changes: 1 };
      }
    };
  }
}

const db = new InMemoryDB();

function initDB() {
  db.exec(`schema`);

  const count = db.prepare('SELECT COUNT(*) as c FROM junctions').get().c;
  if (count === 0) {
    seedData();
  }
}

function seedData() {
  const junctions = [
    { id: 'j1', name: 'Gandhipuram', x: 50, y: 30 },
    { id: 'j2', name: 'Town Hall', x: 30, y: 60 },
    { id: 'j3', name: 'RS Puram', x: 20, y: 40 },
    { id: 'j4', name: 'Ukkadam', x: 30, y: 80 },
    { id: 'j5', name: 'Race Course', x: 60, y: 60 },
    { id: 'j6', name: 'Avinashi Road', x: 80, y: 40 },
    { id: 'j7', name: 'Peelamedu', x: 100, y: 30 },
    { id: 'j8', name: 'Hopes College', x: 120, y: 20 },
    { id: 'j9', name: 'Lakshmi Mills', x: 70, y: 50 },
    { id: 'j10', name: 'Trichy Road Junction', x: 70, y: 70 },
    { id: 'j11', name: 'Singanallur', x: 100, y: 80 },
    { id: 'j12', name: 'Big Bazaar Street', x: 40, y: 65 }
  ];

  const edges = [
    { source: 'j1', target: 'j3', weight: 4 },
    { source: 'j3', target: 'j1', weight: 4 },
    { source: 'j1', target: 'j6', weight: 5 },
    { source: 'j6', target: 'j1', weight: 5 },
    { source: 'j6', target: 'j7', weight: 3 },
    { source: 'j7', target: 'j6', weight: 3 },
    { source: 'j7', target: 'j8', weight: 3 },
    { source: 'j8', target: 'j7', weight: 3 },
    { source: 'j1', target: 'j9', weight: 3 },
    { source: 'j9', target: 'j1', weight: 3 },
    { source: 'j9', target: 'j6', weight: 2 },
    { source: 'j6', target: 'j9', weight: 2 },
    { source: 'j9', target: 'j5', weight: 2 },
    { source: 'j5', target: 'j9', weight: 2 },
    { source: 'j5', target: 'j10', weight: 2 },
    { source: 'j10', target: 'j5', weight: 2 },
    { source: 'j10', target: 'j11', weight: 5 },
    { source: 'j11', target: 'j10', weight: 5 },
    { source: 'j5', target: 'j2', weight: 4 },
    { source: 'j2', target: 'j5', weight: 4 },
    { source: 'j3', target: 'j2', weight: 3 },
    { source: 'j2', target: 'j3', weight: 3 },
    { source: 'j2', target: 'j12', weight: 1 },
    { source: 'j12', target: 'j2', weight: 1 },
    { source: 'j12', target: 'j4', weight: 2 },
    { source: 'j4', target: 'j12', weight: 2 },
    { source: 'j2', target: 'j4', weight: 3 },
    { source: 'j4', target: 'j2', weight: 3 },
    { source: 'j10', target: 'j4', weight: 5 },
    { source: 'j4', target: 'j10', weight: 5 }
  ];

  const insertJunction = db.prepare('INSERT INTO junctions (id, name, x, y) VALUES (?, ?, ?, ?)');
  junctions.forEach(j => insertJunction.run(j.id, j.name, j.x, j.y));

  const insertEdge = db.prepare('INSERT INTO edges (source, target, base_weight) VALUES (?, ?, ?)');
  edges.forEach(e => insertEdge.run(e.source, e.target, e.weight));
}

initDB();

module.exports = db;

