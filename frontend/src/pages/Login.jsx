import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        window.dispatchEvent(new Event('storage')); // trigger nav update
        navigate('/dashboard');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  return (
    <div className="flex justify-center items-center" style={{ minHeight: '60vh' }}>
      <div className="panel" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="flex flex-col items-center mb-6">
          <Shield size={48} className="text-blue mb-2" />
          <h2>Control Room Access</h2>
        </div>
        
        {error && <div className="p-4 mb-4 badge-red rounded-md">{error}</div>}
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-muted mb-2 block">Username</label>
            <input 
              type="text" 
              className="w-full" 
              style={{ width: '100%' }}
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-2 block">Password</label>
            <input 
              type="password" 
              className="w-full"
              style={{ width: '100%' }}
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required
            />
          </div>
          <button type="submit" className="btn btn-primary mt-4 justify-center">
            Authenticate
          </button>
        </form>
        
        <div className="mt-4 text-sm text-muted text-center">
          Demo Credentials: admin / password123
        </div>
      </div>
    </div>
  );
}
