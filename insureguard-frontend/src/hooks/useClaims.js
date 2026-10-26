import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { connectToClaimUpdates, onConnectionStateChange } from '../services/websocket';
import { useAsync } from './useAsync';

/** All claims for the customer, kept fresh by real-time pushes. */
export function useClaims() {
  const { data, loading, error, reload, setData } = useAsync(() => api.listClaims(), []);

  useEffect(
    () =>
      connectToClaimUpdates(null, (updated) =>
        setData((prev) => {
          const list = prev || [];
          // Merge: polling delivers partial updates, mock/WebSocket deliver whole claims.
          return list.some((c) => c.id === updated.id)
            ? list.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
            : [updated, ...list];
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { claims: data || [], loading, error, reload };
}

/** One claim, live-updated. `justUpdated` flips true briefly after a push so UI can flash. */
export function useClaim(id) {
  const { data, loading, error, reload, setData } = useAsync(() => api.getClaim(id), [id]);
  const [justUpdated, setJustUpdated] = useState(false);
  const latest = useRef(null);
  latest.current = data;

  useEffect(() => {
    let timer;
    const disconnect = connectToClaimUpdates(id, (updated) => {
      const prev = latest.current;
      // Polling repeats the same status every few seconds, so only flash when something visibly changed.
      const changed = prev && (prev.status !== updated.status || (updated.events?.length ?? 0) > prev.events.length);
      setData((current) => (current ? { ...current, ...updated } : current));
      if (changed) {
        setJustUpdated(true);
        clearTimeout(timer);
        timer = setTimeout(() => setJustUpdated(false), 1200);
      }
    });
    return () => { disconnect(); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { claim: data, loading, error, reload, justUpdated };
}

export function useConnectionState() {
  const [state, setState] = useState('connecting');
  useEffect(() => onConnectionStateChange(setState), []);
  return state;
}
