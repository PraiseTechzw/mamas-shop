import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors } from '@/constants/theme';
import { subscribeToConnection, type ConnectionState } from '@/lib/network';
import { useAuth } from '@/features/auth/auth-context';
import { getSyncSummary } from '@/db/repositories/settings';
import { getSyncRetryDelay, syncOutbox, type SyncResult } from '@/services/sync-engine';
import { AppText } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/format';
import { subscribeSyncRequested } from '@/services/sync-events';

type SyncContextValue = {
  connection: ConnectionState;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  unavailable: SyncResult['unavailable'];
  syncNow: (force?: boolean) => Promise<void>;
};

const SyncContext = createContext<SyncContextValue>({
  connection: 'checking', syncing: false, pending: 0, failed: 0, lastSyncedAt: null, unavailable: undefined, syncNow: async () => {},
});
const offlineArt = require('@/assets/images/shop-illustrations/sync/offline.png');
const pendingArt = require('@/assets/images/shop-illustrations/sync/sync-pending.png');
const completeArt = require('@/assets/images/shop-illustrations/sync/sync-complete.png');
const failedArt = require('@/assets/images/shop-illustrations/sync/sync-failed.png');

export function SyncProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const { session, configured } = useAuth();
  const ownerId = session?.user.id ?? '';
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<SyncResult['unavailable']>();
  const running = useRef(false);

  const refreshSummary = useCallback(async () => {
    if (!ownerId) { setPending(0); setFailed(0); setLastSyncedAt(null); return; }
    const [summary, metadata] = await Promise.all([
      getSyncSummary(db, ownerId),
      db.getFirstAsync<{ last_synced_at: string | null }>('SELECT last_synced_at FROM sync_metadata WHERE owner_id = ?', ownerId),
    ]);
    setPending(summary?.pending ?? 0);
    setFailed(summary?.failed ?? 0);
    setLastSyncedAt(metadata?.last_synced_at ?? null);
  }, [db, ownerId]);

  const syncNow = useCallback(async (force = false) => {
    if (running.current || connection !== 'online' || !ownerId) return;
    running.current = true;
    setSyncing(true);
    try {
      const result = await syncOutbox(db, ownerId, force);
      setUnavailable(result.unavailable);
      if (result.lastSyncedAt) setLastSyncedAt(result.lastSyncedAt);
      await refreshSummary();
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [connection, db, ownerId, refreshSummary]);

  useEffect(() => subscribeToConnection(setConnection), []);
  useEffect(() => subscribeSyncRequested(() => { void refreshSummary(); void syncNow(); }), [refreshSummary, syncNow]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load persisted queue counts when the signed-in account changes.
  useEffect(() => { void refreshSummary(); }, [refreshSummary]);
  useEffect(() => { if (connection === 'online') void syncNow(); }, [connection, syncNow]);
  useEffect(() => {
    if (connection !== 'online' || pending === 0 || unavailable) return;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    void getSyncRetryDelay(db, ownerId).then((delay) => {
      if (active) timer = setTimeout(() => { void syncNow(); }, delay);
    });
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [connection, pending, failed, db, ownerId, syncNow, unavailable]);

  const value = useMemo(() => ({ connection, syncing, pending, failed, lastSyncedAt, unavailable: configured ? unavailable : 'not-configured', syncNow }), [connection, syncing, pending, failed, lastSyncedAt, unavailable, configured, syncNow]);
  return <SyncContext.Provider value={value}><View style={{ flex: 1 }}><NetworkSyncBanner /><View style={{ flex: 1 }}>{children}</View></View></SyncContext.Provider>;
}

export function useSyncStatus() { return useContext(SyncContext); }

export function NetworkSyncBanner() {
  const { session } = useAuth();
  const { connection, syncing, pending, failed, unavailable, lastSyncedAt } = useSyncStatus();
  const offline = connection === 'offline';
  const needsSetup = unavailable === 'not-configured';
  const failedState = failed > 0 && !offline;
  // Keep the app header clear during normal operation. Show this banner only
  // when the connection or sync queue needs the user's attention.
  const show = connection === 'checking' || offline || syncing || pending > 0 || failedState || needsSetup;
  if (!session || !show) return null;
  const image = offline ? offlineArt : failedState ? failedArt : syncing ? pendingArt : pending ? pendingArt : completeArt;
  const message = offline ? 'Offline · changes stay on this device' : connection === 'checking' ? 'Checking network connection…' : needsSetup ? 'Online · cloud sync needs setup' : syncing ? 'Syncing saved changes…' : failedState ? `${failed} changes will retry automatically` : `${pending} saved ${pending === 1 ? 'change' : 'changes'} waiting to sync`;
  return <View accessibilityLiveRegion="polite" style={[styles.banner, offline && styles.offline, failedState && styles.failed]}>
    <Image source={image} resizeMode="contain" style={styles.art} accessibilityLabel={offline ? 'Shop offline' : 'Shop sync status'} />
    <View style={styles.message}><AppText variant="small" color={colors.deepPurple}>{message}</AppText>{lastSyncedAt && !offline ? <AppText variant="small" color={colors.secondary}>Last synced {formatDateTime(lastSyncedAt)}</AppText> : null}</View>
  </View>;
}

const styles = StyleSheet.create({
  banner: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.lavenderTint, borderBottomWidth: 1, borderColor: colors.border },
  offline: { backgroundColor: '#FFF5DC' },
  failed: { backgroundColor: '#FCEBED' },
  art: { width: 34, height: 34 },
  message: { flex: 1, gap: 1 },
});
