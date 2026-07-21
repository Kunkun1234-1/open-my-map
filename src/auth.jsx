import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setSessionId } from './api.js';

const AuthContext = createContext({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user || null);
      if (!data.user) setSessionId('');
      return data.user || null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* 忽略 */ }
    setSessionId('');
    setUser(null);
  }, []);

  const loginWith = useCallback((token) => {
    setSessionId(token);
    return refresh();
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  const value = { user, loading, refresh, logout, loginWith };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
