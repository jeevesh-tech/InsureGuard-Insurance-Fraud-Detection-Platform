import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, userStore } from '../services/api';
import { USE_MOCK } from '../services/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => userStore.get());

  const logout = useCallback(() => {
    tokenStore.clear();
    userStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener('insureguard:unauthorized', logout);
    return () => window.removeEventListener('insureguard:unauthorized', logout);
  }, [logout]);

  // Keep the profile in step with the backend (name, email, phone may have changed since sign-in).
  useEffect(() => {
    if (!user?.id || USE_MOCK) return undefined;
    let cancelled = false;
    api.getCustomer()
      .then((fresh) => {
        if (cancelled) return;
        userStore.set(fresh);
        setUser(fresh);
      })
      .catch(() => { /* keep the signed-in profile; pages show their own errors */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await api.login(email, password);
    tokenStore.set(token);
    userStore.set(u);
    setUser(u);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
