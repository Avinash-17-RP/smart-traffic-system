const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const db = require('./database');
const routing = require('./routing');
const simulation = require('./simulation');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const JWT_SECRET = 'matrsn_super_secret_key_for_demo';

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'password123') {
    const token = jwt.sign({ role: 'operator' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Health check endpoint for Render / monitoring
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/graph', (req, res) => {
  res.json(routing.getGraph());
});

app.post('/api/route/shortest', (req, res) => {
  const { from, to } = req.body;
  const result = routing.calculateShortestPath(from, to);
  res.json(result);
});

app.post('/api/route/emergency', (req, res) => {
  const { from, to } = req.body;
  const result = routing.calculateEmergencyPath(from, to);
  
  db.prepare('INSERT INTO dispatch_log (source_id, target_id, eta_corridor, eta_normal) VALUES (?, ?, ?, ?)')
    .run(from, to, result.etaWithCorridor, result.etaWithoutCorridor);

  io.emit('emergency:started', { path: result.greenCorridorJunctions, timestamp: Date.now() });
  
  setTimeout(() => {
    io.emit('emergency:cleared', { timestamp: Date.now() });
  }, 15000);
  
  res.json(result);
});

app.post('/api/route/loadbalance', (req, res) => {
  const { from, to, vehicleCount = 100 } = req.body;
  const result = routing.calculateLoadBalance(from, to, vehicleCount);
  res.json(result);
});

app.get('/api/junctions/:id', (req, res) => {
  const junction = db.prepare('SELECT * FROM junctions WHERE id = ?').get(req.params.id);
  if (junction) res.json(junction);
  else res.status(404).json({ error: 'Not found' });
});

app.post('/api/junctions/:id/mode', authenticateToken, (req, res) => {
  const { mode } = req.body;
  if (!['fixed', 'adaptive'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  db.prepare('UPDATE junctions SET mode = ? WHERE id = ?').run(mode, req.params.id);
  
  const junction = db.prepare('SELECT * FROM junctions WHERE id = ?').get(req.params.id);
  io.emit('junction:update', junction);
  
  res.json({ success: true, mode });
});

app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  const recent = db.prepare('SELECT * FROM history ORDER BY timestamp DESC LIMIT 1').get();
  
  const jModes = db.prepare('SELECT mode, COUNT(*) as c FROM junctions GROUP BY mode').all();
  let adaptiveCount = jModes.find(m => m.mode === 'adaptive')?.c || 0;
  let fixedCount = jModes.find(m => m.mode === 'fixed')?.c || 0;
  
  res.json({
    avgCityWaitTime: recent ? recent.avg_wait_time.toFixed(1) : 0,
    activeHotspots: recent ? recent.active_hotspots : 0,
    vehiclesSimulated: recent ? recent.vehicles_simulated : 0,
    emergenciesActive: 0,
    comparisonFixedVsAdaptive: `Fixed: ${fixedCount} | Adaptive: ${adaptiveCount}`
  });
});

app.get('/api/dashboard/history', authenticateToken, (req, res) => {
  const minutes = req.query.minutes || 30;
  const history = db.prepare('SELECT * FROM history ORDER BY id DESC LIMIT ?').all(Math.min(minutes * 6, 100));
  res.json(history.reverse());
});

app.get('/api/dispatch/log', authenticateToken, (req, res) => {
  const logs = db.prepare('SELECT * FROM dispatch_log ORDER BY timestamp DESC LIMIT 10').all();
  res.json(logs);
});

app.post('/api/simulate/tick', (req, res) => {
  simulation.tick(io);
  res.json({ success: true });
});

simulation.startSimulation(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`MA-TRSN Backend running on port ${PORT}`);
});
