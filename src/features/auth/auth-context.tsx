import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { useSQLiteContext } from 'expo-sqlite';
import { getShopSettings } from '@/db/repositories/settings';
import { setAppCurrency } from '@/lib/format';
import { checkConnection } from '@/lib/network';
import { getOfflineBusinessScope, persistBusinessScope } from '@/services/business-scope';

type AuthContextValue = { session: Session | null; userId: string | null; businessId: string | null; offlineAccess: boolean; loading: boolean; configured: boolean; setActiveBusiness: (businessId: string) => Promise<void> };
const AuthContext = createContext<AuthContextValue>({ session: null, userId: null, businessId: null, offlineAccess: false, loading: true, configured: false, setActiveBusiness: async () => {} });

export function AuthProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessId, setBusinessIdState] = useState<string | null>(null);
  const [offlineUserId, setOfflineUserId] = useState<string | null>(null);
  const authEventVersion = useRef(0);

  const restoreOfflineAccess = useCallback(async () => {
    const scope = await getOfflineBusinessScope(db);
    if (!scope) return false;
    setOfflineUserId(scope.user_id);
    setBusinessIdState(scope.business_id);
    setBusinessLoading(false);
    setAppCurrency((await getShopSettings(db, scope.business_id)).currency);
    return true;
  }, [db]);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      // The offline scope is read from SQLite before the root route can decide
      // whether to show the welcome screen or the saved shop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void restoreOfflineAccess().catch((error) => {
        console.error('[auth] Could not restore the saved shop for offline use', error);
      }).finally(() => {
        if (active) {
          setBusinessLoading(false);
          setAuthLoading(false);
        }
      });
      return () => { active = false; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event !== 'INITIAL_SESSION') authEventVersion.current += 1;
      if (nextSession) {
        setSession(nextSession);
        setOfflineUserId(null);
        setBusinessLoading(true);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setOfflineUserId(null);
        setBusinessIdState(null);
        setBusinessLoading(false);
      }
    });

    const requestVersion = authEventVersion.current;
    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (authEventVersion.current !== requestVersion) {
        setAuthLoading(false);
        return;
      }
      if (data.session) {
        setSession(data.session);
        setOfflineUserId(null);
        setBusinessLoading(true);
      } else {
        let restored = false;
        if (error) {
          try {
            restored = await restoreOfflineAccess();
          } catch (restoreError) {
            console.error('[auth] Could not restore the saved shop for offline use', restoreError);
          }
          if (!restored) console.warn('[auth] Could not restore a saved session', error);
        }
        if (!restored) {
          setSession(null);
          setOfflineUserId(null);
          setBusinessIdState(null);
          setBusinessLoading(false);
        }
      }
      setAuthLoading(false);
    }).catch(async (error) => {
      if (!active) return;
      let restored = false;
      try {
        restored = await restoreOfflineAccess();
      } catch (restoreError) {
        console.error('[auth] Could not restore the saved shop for offline use', restoreError);
      }
      if (!restored) {
        console.error('[auth] Could not restore a saved session', error);
        setBusinessLoading(false);
      }
      setAuthLoading(false);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [restoreOfflineAccess]);

  useEffect(() => {
    const userId = session?.user.id ?? offlineUserId;
    if (!userId) return;
    let active = true;
    void (async () => {
      const cached = await db.getFirstAsync<{ business_id: string }>('SELECT business_id FROM business_scopes WHERE user_id = ?', userId);
      let resolved = cached?.business_id ?? userId;
      if (!active) return;
      setBusinessIdState(resolved);
      setAppCurrency((await getShopSettings(db, resolved)).currency);
      if (cached) setBusinessLoading(false);

      if (!session || offlineUserId || !supabase) {
        setBusinessLoading(false);
        return;
      }

      const connection = await checkConnection();
      if (connection === 'offline') {
        await persistBusinessScope(db, userId, resolved);
        setBusinessLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('my_business_id');
      if (error) console.warn('[auth] Could not refresh the active shop scope', error);
      else if (typeof data === 'string' && data) resolved = data;
      if (!active) return;
      await persistBusinessScope(db, userId, resolved);
      setBusinessIdState(resolved);
      setBusinessLoading(false);
      const settings = await getShopSettings(db, resolved);
      if (active) setAppCurrency(settings.currency);
    })().catch((error) => {
      console.error('[auth] Could not load the saved shop scope', error);
      if (active) setBusinessLoading(false);
    });
    return () => { active = false; };
  }, [db, offlineUserId, session]);

  const loading = authLoading || businessLoading;
  const userId = session?.user.id ?? offlineUserId;
  const setActiveBusiness = useCallback(async (nextBusinessId: string) => {
    if (!session) throw new Error('Sign in before joining a shop.');
    const authenticatedUserId = session.user.id;
    await persistBusinessScope(db, authenticatedUserId, nextBusinessId);
    setBusinessIdState(nextBusinessId);
    setBusinessLoading(false);
    const settings = await getShopSettings(db, nextBusinessId);
    setAppCurrency(settings.currency);
  }, [db, session]);
  const offlineAccess = Boolean(offlineUserId && !session);
  const value = useMemo(() => ({ session, userId, businessId, offlineAccess, loading, configured: hasSupabaseConfig, setActiveBusiness }), [session, userId, businessId, offlineAccess, loading, setActiveBusiness]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
export function useAuthClient() {
  if (!supabase) throw new Error('Connect Supabase first by setting EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  return supabase;
}
