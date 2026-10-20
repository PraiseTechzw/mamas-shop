import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CircleHelp, Database } from 'lucide-react-native';
import { useAuth } from '@/features/auth/auth-context';
import { getShopSettings, saveShopSettings } from '@/db/repositories/settings';
import { colors } from '@/constants/theme';
import { formatDateTime, setAppCurrency } from '@/lib/format';
import { AppText, Card, Field, Page, PrimaryButton, StatusBadge } from '@/components/ui/primitives';
import { useSyncStatus } from '@/features/sync/sync-context';
import { retrySyncConflicts } from '@/services/sync-engine';

export function SettingsScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const owner = businessId ?? session?.user.id ?? '';
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [alerts, setAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getShopSettings(db, owner).then((settings) => {
      setName(settings.shop_name);
      setCurrency(settings.currency);
      setAppCurrency(settings.currency);
      setAlerts(Boolean(settings.low_stock_alerts));
    });
  }, [db, owner]);

  const save = async () => {
    setBusy(true);
    try {
      await saveShopSettings(db, owner, name, currency, alerts);
      setAppCurrency(currency);
      setSaved(true);
      Alert.alert('Settings saved', 'Your shop preferences have been updated.');
    } finally {
      setBusy(false);
    }
  };

  return <Page title="Shop settings" subtitle="Set your shop name and currency." back>
    <Card style={{ gap: 12 }}>
      <AppText variant="heading">Shop profile</AppText>
      <Field label="Shop name" value={name} onChangeText={setName} placeholder="Mama’s Shop" />
      <AppText variant="label">Currency</AppText>
      <View style={styles.wrap}>{['USD', 'ZWL', 'ZAR', 'BWP'].map((code) => <Pressable key={code} onPress={() => setCurrency(code)} style={[styles.chip, currency === code && styles.selected]}><AppText variant="label" color={currency === code ? colors.deepPurple : colors.secondary}>{code}</AppText></Pressable>)}</View>
      <Pressable onPress={() => setAlerts((value) => !value)} style={styles.toggleRow}><View style={{ flex: 1 }}><AppText variant="label">Low stock reminders</AppText><AppText variant="small" color={colors.secondary}>Highlight products that need restocking</AppText></View><StatusBadge label={alerts ? 'On' : 'Off'} tone={alerts ? 'green' : 'purple'} /></Pressable>
      <PrimaryButton label={saved ? 'Saved' : 'Save shop settings'} loading={busy} onPress={save} />
    </Card>
    <Pressable onPress={() => router.push('/settings/sync')} style={styles.syncLink}><Database size={18} stroke={colors.purple} /><View style={{ flex: 1 }}><AppText variant="label">Sync status</AppText><AppText variant="small" color={colors.secondary}>Offline saves and cloud sync</AppText></View></Pressable>
  </Page>;
}

export function SyncSettingsScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const { connection, syncing, pending, failed, conflicts, lastSyncedAt, unavailable, syncNow } = useSyncStatus();
  const art = connection === 'offline' ? require('@/assets/images/shop-illustrations/sync/offline.png') : failed || conflicts ? require('@/assets/images/shop-illustrations/sync/sync-failed.png') : pending || syncing ? require('@/assets/images/shop-illustrations/sync/sync-pending.png') : require('@/assets/images/shop-illustrations/sync/sync-complete.png');
  const statusLabel = connection === 'offline' ? 'Offline' : connection === 'checking' ? 'Checking connection' : syncing ? 'Syncing' : conflicts ? 'Review needed' : failed ? 'Retry needed' : pending ? 'Waiting to sync' : 'Up to date';
  const tone = connection === 'offline' || pending ? 'amber' : failed || conflicts ? 'red' : connection === 'online' ? 'green' : 'blue';
  return <Page title="Sync status" subtitle="Changes save here first, then sync to your signed-in shop." back>
    <Card style={{ alignItems: 'center', gap: 11 }}>
      <Image source={art} resizeMode="contain" style={{ width: 144, height: 128 }} accessibilityLabel="Illustration of shop connection and syncing" />
      <StatusBadge label={statusLabel} tone={tone} />
      <AppText variant="heading" style={{ textAlign: 'center' }}>{pending === 0 ? 'Your saved changes are up to date' : `${pending} saved ${pending === 1 ? 'change' : 'changes'} waiting`}</AppText>
      <AppText color={colors.secondary} style={{ textAlign: 'center', lineHeight: 21 }}>{connection === 'offline' ? 'You can keep making sales and updating stock. This device will upload queued changes when a connection returns.' : unavailable === 'not-configured' ? 'Your records are safe on this device. Add the Supabase project connection and apply the sync migrations to enable cloud backup.' : conflicts ? `${conflicts} incoming change${conflicts === 1 ? '' : 's'} could not be applied safely. Review the conflict details below.` : failed ? `${failed} change${failed === 1 ? '' : 's'} could not upload yet. The app will retry when a connection is available.` : 'Changes upload and download for this signed-in shop. Financial and stock history is kept as individual events.'}</AppText>
      {lastSyncedAt ? <AppText variant="small" color={colors.secondary}>Last successful sync · {formatDateTime(lastSyncedAt)}</AppText> : null}
      <PrimaryButton label={syncing ? 'Syncing…' : connection === 'offline' ? 'Waiting for connection' : 'Sync now'} loading={syncing} disabled={connection !== 'online' || Boolean(unavailable)} onPress={() => void syncNow(true)} style={{ alignSelf: 'stretch' }} />
    </Card>
    {conflicts ? <SyncConflictReview db={db} ownerId={ownerId} onRetry={() => void syncNow(true)} /> : null}
    <Card style={{ gap: 9 }}>
      <View style={styles.location}><Database stroke={colors.purple} /><View style={{ flex: 1 }}><AppText variant="label">On this device</AppText><AppText variant="small" color={colors.secondary}>Local records stay available offline</AppText></View><StatusBadge label="Saved" tone="green" /></View>
      <View style={styles.location}><View style={{ flex: 1 }}><AppText variant="label">Cloud sync</AppText><AppText variant="small" color={colors.secondary}>{pending} pending · {failed} upload retries · {conflicts} conflicts</AppText></View><StatusBadge label={unavailable ? 'Not connected' : connection === 'online' ? 'Available' : 'Offline'} tone={unavailable ? 'amber' : connection === 'online' ? 'blue' : 'amber'} /></View>
    </Card>
  </Page>;
}

function SyncConflictReview({ db, ownerId, onRetry }: { db: ReturnType<typeof useSQLiteContext>; ownerId: string; onRetry: () => void }) {
  const [rows, setRows] = useState<{ idempotency_key: string; description: string; created_at: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => setRows(await db.getAllAsync<{ idempotency_key: string; description: string; created_at: string }>('SELECT idempotency_key, description, created_at FROM sync_conflicts WHERE owner_id = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 5', ownerId));
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load unresolved conflicts from local SQLite when this screen opens.
  useEffect(() => { void load(); }, [db, ownerId]);
  const retry = async () => { setBusy(true); try { await retrySyncConflicts(db, ownerId); await load(); onRetry(); } finally { setBusy(false); } };
  return <Card style={{ gap: 10, borderColor: '#F1C7CC' }}><AppText variant="heading" color={colors.danger}>Changes to review</AppText>{rows.map((row) => <View key={row.idempotency_key} style={styles.conflictRow}><CircleHelp size={16} stroke={colors.danger} /><AppText variant="small" color={colors.secondary} style={{ flex: 1 }}>{row.description}</AppText></View>)}<AppText variant="small" color={colors.secondary}>Stock conflicts are kept here instead of overwriting a newer count or allowing negative stock. Fix the source issue, then retry.</AppText><PrimaryButton label={busy ? 'Retrying…' : 'Retry unresolved changes'} loading={busy} onPress={() => void retry()} />
  </Card>;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, minHeight: 40, justifyContent: 'center' },
  selected: { borderColor: colors.purple, backgroundColor: colors.lavenderTint },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  syncLink: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: '#FFFFFF' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  conflictRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
