import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { useSQLiteContext } from 'expo-sqlite';
import { getShopSettings } from '@/db/repositories/settings';
import { setAppCurrency } from '@/lib/format';

type AuthContextValue = { session: Session | null; loading: boolean; configured: boolean };
const AuthContext = createContext<AuthContextValue>({ session: null, loading: true, configured: false });

export function AuthProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false); } }).catch(() => { if (active) setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (session?.user.id) void getShopSettings(db, session.user.id).then((settings) => setAppCurrency(settings.currency)); }, [db, session?.user.id]);
  const value = useMemo(() => ({ session, loading, configured: hasSupabaseConfig }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
export function useAuthClient() {
  if (!supabase) throw new Error('Connect Supabase first by setting EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  return supabase;
}
