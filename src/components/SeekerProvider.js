'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';

const SeekerContext = createContext({ seeker: null, loading: false, setSeeker: () => {}, logout: async () => {} });
export const useSeeker = () => useContext(SeekerContext);

/** The signed-in job seeker (separate from staff sign-in), or null. */
export function SeekerProvider({ children }) {
  const [seeker, setSeeker] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/seeker/me')
      .catch(() => ({ seeker: null }))
      .then(async ({ seeker }) => {
        setSeeker(seeker);
        // An expired cookie still gets past the middleware: clear it so /my/login doesn't bounce back
        const path = window.location.pathname;
        if (!seeker && path.startsWith('/my') && !['/my/login', '/my/signup'].includes(path)) {
          await api('/seeker/logout', { method: 'POST' }).catch(() => {});
          window.location.assign('/my/login');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await api('/seeker/logout', { method: 'POST' }).catch(() => {});
    setSeeker(null);
    window.location.assign('/check-cv');
  }, []);

  return <SeekerContext.Provider value={{ seeker, loading, setSeeker, logout }}>{children}</SeekerContext.Provider>;
}
