import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Activity, Map, LayoutDashboard, LogIn } from 'lucide-react';

import CitizenRoute from './pages/CitizenRoute';
import GraphView from './pages/GraphView';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

import { API_BASE_URL } from './config';
import { mockSocket } from './mockEngine';

// Real socket connection
const realSocket = io(API_BASE_URL || 'http://localhost:5000', {
  transports: ['websocket', 'polling'],
  autoConnect: true
});

// Unified socket proxy that bridges real Socket.IO and mockSocket for Netlify standalone deployment
export const socket = {
  on(event, callback) {
    realSocket.on(event, callback);
    mockSocket.on(event, callback);
  },
  off(event, callback) {
    realSocket.off(event, callback);
    mockSocket.off(event, callback);
  },
  emit(event, data) {
    if (realSocket.connected) {
      realSocket.emit(event, data);
    }
    mockSocket.emit(event, data);
  }
};

function Navigation() {
  const location = useLocation();
  const token = localStorage.getItem('token');
  
  return (
    <nav className="navbar">
      <div className="flex items-center gap-2">
        <Activity className="text-cyan-400" size={22} />
        <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 tracking-tight">VELOCITA 360</h1>
      </div>
      <div className="nav-links">
        <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''} flex items-center gap-2`}>
          <Map size={18} /> Citizen Route
        </Link>
        <Link to="/graph" className={`nav-link ${location.pathname === '/graph' ? 'active' : ''} flex items-center gap-2`}>
          <Activity size={18} /> Live City Graph
        </Link>
        {token ? (
          <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''} flex items-center gap-2`}>
            <LayoutDashboard size={18} /> Control Room
          </Link>
        ) : (
          <Link to="/login" className={`nav-link ${location.pathname === '/login' ? 'active' : ''} flex items-center gap-2`}>
            <LogIn size={18} /> Operator Login
          </Link>
        )}
      </div>
    </nav>
  );
}

function MainContent() {
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';
  const isGraph = location.pathname === '/graph';
  const mainClass = isDashboard ? 'main-content dashboard-main' : isGraph ? 'main-content graph-main' : 'main-content';
  return <main className={mainClass}><Routes>
    <Route path="/" element={<CitizenRoute />} />
    <Route path="/graph" element={<GraphView />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/login" element={<Login />} />
  </Routes></main>;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  useEffect(() => {
    const handleStorage = () => {
      setToken(localStorage.getItem('token'));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <Router>
      <div className="app-container">
        <Navigation />
        <MainContent />
      </div>
    </Router>
  );
}

export default App;
