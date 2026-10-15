import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { useSQLiteContext } from 'expo-sqlite';
import { getShopSettings } from '@/db/repositories/settings';
import { setAppCurrency } from '@/lib/format';
import { persistBusinessScope } from '@/services/business-membership';

type AuthContextValue = { session: Session | null; businessId: string | null; loading: boolean; configured: boolean; setBusinessId: (businessId: string) => Promise<void> };
const AuthContext = createContext<AuthContextValue>({ session: null, businessId: null, loading: true, configured: false, setBusinessId: async () => {} });

export function AuthProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [businessLoading, setBusinessLoading] = useState(Boolean(supabase));
  const [businessId, setBusinessIdState] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setBusinessLoading(Boolean(data.session)); setAuthLoading(false); } }).catch(() => { if (active) { setBusinessLoading(false); setAuthLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setBusinessLoading(Boolean(nextSession));
      if (!nextSession) setBusinessIdState(null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) { setBusinessIdState(null); setBusinessLoading(false); return; }
    let active = true;
    void (async () => {
      const cached = await db.getFirstAsync<{ business_id: string }>('SELECT business_id FROM business_scopes WHERE user_id = ?', userId).catch(() => null);
      if (active) setBusinessIdState(cached?.business_id ?? userId);
      let resolved = cached?.business_id ?? userId;
      if (supabase) {
        const { data, error } = await supabase.rpc('my_business_id');
        if (!error && typeof data === 'string' && data) resolved = data;
      }
      if (!active) return;
      await persistBusinessScope(db, userId, resolved);
      setBusinessIdState(resolved);
      setBusinessLoading(false);
      const settings = await getShopSettings(db, resolved);
      if (active) setAppCurrency(settings.currency);
    })().catch(() => { if (active) setBusinessLoading(false); });
    return () => { active = false; };
  }, [db, session?.user.id]);
  const setBusinessId = useCallback(async (nextBusinessId: string) => {
    const userId = session?.user.id;
    if (!userId) throw new Error('Sign in before changing businesses.');
    await persistBusinessScope(db, userId, nextBusinessId);
    setBusinessIdState(nextBusinessId);
  }, [db, session?.user.id]);
  const loading = authLoading || businessLoading;
  const value = useMemo(() => ({ session, businessId, loading, configured: hasSupabaseConfig, setBusinessId }), [session, businessId, loading, setBusinessId]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
export function useAuthClient() {
  if (!supabase) throw new Error('Connect Supabase first by setting EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  return supabase;
}
