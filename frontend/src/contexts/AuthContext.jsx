import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../utils/firebase';

const AuthContext = createContext(null);

function normalizeUser(u) {
  if (!u) return null;
  const isAdmin = u.role === 'SUPER_ADMIN' || (u.email || '').toLowerCase() === 'admin@dit.ac.tz';
  return { ...u, role: isAdmin ? 'SUPER_ADMIN' : (u.role || 'TEACHER') };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const token = localStorage.getItem('dit_token');
      const savedUser = localStorage.getItem('dit_user');
      if (token && savedUser) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        try {
          setUser(normalizeUser(JSON.parse(savedUser)));
        } catch {
          // ignore corrupted localStorage entry
        }
        try {
          const res = await api.get('/auth/me');
          if (active && res.data?.user) {
            const fresh = normalizeUser(res.data.user);
            localStorage.setItem('dit_user', JSON.stringify(fresh));
            setUser(fresh);
          }
        } catch (err) {
          if (active && err.response?.status === 401) {
            localStorage.removeItem('dit_token');
            localStorage.removeItem('dit_user');
            delete api.defaults.headers.common['Authorization'];
            setUser(null);
          }
        }
      }
      if (active) setLoading(false);
    };
    init();
    return () => { active = false; };
  }, []);

  const tryRequest = async (fn, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try { return await fn(); }
      catch (err) {
        const status = err.response?.status;
        if (i < retries && (!status || status >= 500)) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        throw err;
      }
    }
  };

  const persistSession = (token, rawUser) => {
    const normalized = normalizeUser(rawUser);
    localStorage.setItem('dit_token', token);
    localStorage.setItem('dit_user', JSON.stringify(normalized));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(normalized);
    return normalized;
  };

  const login = async (email, password) => {
    const res = await tryRequest(() => api.post('/auth/login', { email, password }));
    const normalized = persistSession(res.data.token, res.data.user);
    return { ...res.data, user: normalized };
  };

  const register = async (name, email, password) => {
    const res = await tryRequest(() => api.post('/auth/register', { name, email, password }));
    const normalized = persistSession(res.data.token, res.data.user);
    return { ...res.data, user: normalized };
  };

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;
    const res = await api.post('/auth/google', {
      email: firebaseUser.email,
      name: firebaseUser.displayName || firebaseUser.email.split('@')[0]
    });
    const normalized = persistSession(res.data.token, res.data.user);
    return { ...res.data, user: normalized };
  };

  const logout = () => {
    localStorage.removeItem('dit_token');
    localStorage.removeItem('dit_user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <AuthContext.Provider value={{ user, isSuperAdmin, login, register, loginWithGoogle, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
