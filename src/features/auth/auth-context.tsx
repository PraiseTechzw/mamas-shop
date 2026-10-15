import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

type AuthContextValue = { session: Session | null; loading: boolean; configured: boolean };
const AuthContext = createContext<AuthContextValue>({ session: null, loading: true, configured: false });

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false); } }).catch(() => { if (active) setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const value = useMemo(() => ({ session, loading, configured: hasSupabaseConfig }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
export function useAuthClient() {
  if (!supabase) throw new Error('Connect Supabase first by setting EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  return supabase;
}
