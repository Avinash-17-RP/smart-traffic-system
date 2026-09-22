import { mockEngine } from './mockEngine';

const rawUrl = import.meta.env.VITE_API_URL;
export const API_BASE_URL = rawUrl ? rawUrl.replace(/\/+$/, '') : '';

// Intercept window.fetch to provide zero-backend in-browser API fallback for Netlify static deployment
const originalFetch = window.fetch.bind(window);

window.fetch = async (url, options = {}) => {
  const urlString = typeof url === 'string' ? url : url.url;
  
  // Only handle /api/ routes
  if (urlString.includes('/api/')) {
    // If an explicit remote API host is defined, try it first
    if (API_BASE_URL) {
      try {
        const response = await originalFetch(url, options);
        if (response.ok) return response;
      } catch (err) {
        console.warn('Backend server unreachable, failing over to client-side mock engine:', err);
      }
    }

    // Process via mockEngine
    let body = {};
    if (options.body) {
      try { body = JSON.parse(options.body); } catch (e) { body = {}; }
    }

    const path = urlString.replace(/^https?:\/\/[^\/]+/, '');

    const makeResponse = (data, status = 200) => 
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });

    if (path.includes('/api/auth/login')) {
      const { username, password } = body;
      if (username === 'admin' && (password === 'password123' || password === 'admin123')) {
        return makeResponse({ token: 'mock_jwt_token_operator_role' });
      }
      return makeResponse({ error: 'Invalid credentials' }, 401);
    }

    if (path.includes('/api/graph')) {
      return makeResponse(mockEngine.getGraph());
    }

    if (path.includes('/api/route/shortest')) {
      return makeResponse(mockEngine.calculateShortestPath(body.from, body.to));
    }

    if (path.includes('/api/route/emergency')) {
      return makeResponse(mockEngine.calculateEmergencyPath(body.from, body.to));
    }

    if (path.includes('/api/route/loadbalance')) {
      return makeResponse(mockEngine.calculateLoadBalance(body.from, body.to, body.vehicleCount));
    }

    if (path.match(/\/api\/junctions\/[^\/]+\/mode/)) {
      const parts = path.split('/');
      const id = parts[parts.length - 2];
      return makeResponse(mockEngine.setJunctionMode(id, body.mode));
    }

    if (path.match(/\/api\/junctions\/[^\/]+/)) {
      const parts = path.split('/');
      const id = parts[parts.length - 1];
      const j = mockEngine.junctions.find(item => item.id === id);
      return j ? makeResponse(j) : makeResponse({ error: 'Not found' }, 404);
    }

    if (path.includes('/api/dashboard/stats')) {
      return makeResponse(mockEngine.getDashboardStats());
    }

    if (path.includes('/api/dashboard/history')) {
      return makeResponse(mockEngine.getDashboardHistory());
    }

    if (path.includes('/api/dispatch/log')) {
      return makeResponse(mockEngine.getDispatchLog());
    }

    if (path.includes('/api/health')) {
      return makeResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }
  }

  return originalFetch(url, options);
};
