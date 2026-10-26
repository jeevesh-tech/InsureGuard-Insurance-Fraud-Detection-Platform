import { AlertTriangle, Loader2 } from 'lucide-react';

export function Loading({ label = 'Loading…' }) {
  return <div className="state"><Loader2 className="spin" size={22} /> {label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error">
      <AlertTriangle size={22} />
      <span>{error?.message || 'Something went wrong.'}</span>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="state">{children}</div>;
}
