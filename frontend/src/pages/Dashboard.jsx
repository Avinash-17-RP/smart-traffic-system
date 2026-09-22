import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadNetwork } from '../controlroom/data/network';
import { loadMapLabels } from '../controlroom/data/mapLabels';
import '../controlroom/controlroom.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [ControlRoomApp, setControlRoomApp] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Load the full Coimbatore network before importing the simulation store.
        // This keeps the 84k-node graph out of the TypeScript bundle and avoids
        // the broken/partial dashboard state caused by eager initialization.
        await Promise.all([loadNetwork(), loadMapLabels()]);
        const module = await import('../controlroom/ControlRoomApp.tsx');
        if (!cancelled) setControlRoomApp(() => module.default);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Control Room failed to load');
      }
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  if (error) {
    return (
      <div style={{ padding: 24, color: '#f87171' }}>
        <h2>Control Room failed to load</h2>
        <p style={{ marginTop: 8, color: '#94a3b8' }}>{error}</p>
      </div>
    );
  }

  if (!ControlRoomApp) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: '#050a14', color: '#38bdf8' }}>
        Loading full Coimbatore Control Room…
      </div>
    );
  }

  return <ControlRoomApp />;
}
