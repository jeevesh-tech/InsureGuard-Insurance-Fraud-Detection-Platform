import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Camera, Loader2, Radio, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../hooks/useAuth';
import { USE_MOCK } from '../services/config';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(USE_MOCK ? 'alex.morgan@example.com' : '');
  const [password, setPassword] = useState(USE_MOCK ? 'demo-password' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-hero">
        <Logo light />
        <h1>Claims that move at the speed of your day.</h1>
        <p>Submit a claim in minutes, upload your photos, and watch every step of the review in real time.</p>
        <ul>
          <li><Camera size={18} /> Upload accident photos and documents securely</li>
          <li><Radio size={18} /> Live status – no more waiting on hold</li>
          <li><ShieldCheck size={18} /> Automated checks keep premiums fair for everyone</li>
        </ul>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mobile-logo"><Logo /></div>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to manage your policy and claims.</p>

          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" required />
          </label>
          {USE_MOCK && (
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
          )}

          {error && <div className="alert alert-error" role="alert">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <><Loader2 size={16} className="spin" /> Signing in…</> : 'Sign in'}
          </button>
          <p className="hint">
            {USE_MOCK
              ? 'Local preview without a backend: any email and password will work.'
              : 'Demo sign-in: enter the email address on your policy.'}
          </p>
        </form>
      </section>
    </div>
  );
}
