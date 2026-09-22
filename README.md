# MA-TRSN: Multi-Algorithm Adaptive Traffic Routing & Signal Network

This is a prototype full-stack web application for the Smart City traffic routing project.

## Project Structure

- `/backend`: Node.js, Express, Socket.IO, better-sqlite3. Simulates traffic and exposes API routes.
- `/frontend`: React, Vite, Socket.IO-Client, React Router. Live dashboard and routing GUI.

## Prerequisites

- Node.js (v18+)

## How to Run

You will need two terminal tabs/windows.

### 1. Start the Backend (Port 5000)

```bash
cd backend
npm install
npm run dev
```

### 2. Start the Frontend (Port 5173)

```bash
cd frontend
npm install
npm run dev
```

## Features Demoed

1. **Live City Graph (`/graph`)**: A WebSocket-driven SVG graph representing the road network of Coimbatore. Nodes change colors based on simulated queue lengths.
2. **Algorithm Switcher (`/graph`)**: 
   - **Shortest Path**: Uses Dijkstra's algorithm.
   - **Emergency Corridor**: Uses A* search heuristic to prioritize speed and broadcasts an "emergency" event.
   - **Load Balancing**: Splits traffic across multiple parallel paths based on congestion.
3. **Control Room Dashboard (`/dashboard`)**: Requires login (`admin` / `password123`). Shows real-time statistics and recent dispatch logs.
4. **Adaptive Signal Control**: Click a node in the graph view to toggle it between `fixed` and `adaptive` signal timing mode.
5. **Citizen Route Lookup (`/`)**: A public-facing UI for standard routing requests.

## Architecture Highlights
- Real-time event pushing via WebSockets (Socket.IO).
- SQL database persisting graph topology and historical simulation metrics.
- Centralized simulation engine that periodically tweaks edge weights (simulating changing traffic) and emits events to all connected clients.
