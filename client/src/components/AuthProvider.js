'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, onUnauthorized } from '@/lib/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const expire = useCallback(async () => {
    // Clear the stale cookie so middleware doesn't bounce us back from /login.
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [router, pathname]);

  useEffect(() => onUnauthorized(expire), [expire]);

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => expire())
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    router.replace('/login');
  }, [router]);

  return <AuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</AuthContext.Provider>;
}
