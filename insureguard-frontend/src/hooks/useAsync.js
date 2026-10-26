import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs an async loader on mount (and on reload()). Ignores results from stale/unmounted runs. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useRef(0);

  const load = useCallback(() => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => id === run.current && setState({ data, loading: false, error: null }))
      .catch((error) => id === run.current && setState({ data: null, loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
    return () => { run.current++; };
  }, [load]);

  return { ...state, reload: load, setData: (next) => setState((s) => ({ ...s, data: typeof next === 'function' ? next(s.data) : next })) };
}
