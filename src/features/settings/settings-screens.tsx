import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Banknote, Building2, Check, ChevronRight, CircleHelp, Database, Info, Languages, Store, Wifi, WifiOff } from 'lucide-react-native';
import { useAuth } from '@/features/auth/auth-context';
import { getShopSettings, saveShopSettings } from '@/db/repositories/settings';
import { colors } from '@/constants/theme';
import { formatDateTime, setAppCurrency } from '@/lib/format';
import { AppText, Card, Field, Page, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/ui/primitives';
import { useSyncStatus } from '@/features/sync/sync-context';
import { retrySyncConflicts } from '@/services/sync-engine';

export function SettingsScreen() {
  const openBackupInfo = () => Alert.alert(
    'Backup & Restore',
    'Manual backup and restore is not available yet. Signed-in shops sync changes to the cloud when a connection is available.',
    [{ text: 'View sync status', onPress: () => router.push('/settings/sync') }, { text: 'Close', style: 'cancel' }],
  );
  const showLanguageInfo = () => Alert.alert('Language', 'English is currently the available app language.');

  return <Page title="Settings" subtitle="Manage your shop and app preferences." back>
    <Card style={{ gap: 2, paddingVertical: 5 }}>
      <SettingsRow title="Business Details" subtitle="Shop name and stock reminders" icon={Store} onPress={() => router.push('/settings/business')} />
      <SettingsRow title="Currency & Receipt" subtitle="Set your currency and preview receipt totals" icon={Banknote} onPress={() => router.push('/settings/currency')} />
      <SettingsRow title="Offline & Sync" subtitle="Local saves and cloud sync status" icon={Wifi} onPress={() => router.push('/settings/sync')} />
      <SettingsRow title="Backup & Restore" subtitle="Learn how your shop data is kept safe" icon={Database} onPress={openBackupInfo} />
      <SettingsRow title="Language" subtitle="Choose the app language" icon={Languages} value="English" onPress={showLanguageInfo} />
      <SettingsRow title="Help & Support" subtitle="Offline use and sync guidance" icon={CircleHelp} onPress={() => router.push('/settings/help')} />
      <SettingsRow title="About" subtitle="About Mama's Shop" icon={Info} onPress={() => router.push('/settings/about')} />
    </Card>
  </Page>;
}

function SettingsRow({ title, subtitle, icon: Icon, value, onPress }: {
  title: string;
  subtitle: string;
  icon: typeof Store;
  value?: string;
  onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}${value ? `, ${value}` : ''}`} onPress={onPress} style={styles.settingsRow}>
    <Icon size={18} color={colors.info} />
    <View style={{ flex: 1 }}>
      <AppText variant="label">{title}</AppText>
      <AppText variant="small" color={colors.secondary} style={{ marginTop: 2 }}>{subtitle}</AppText>
    </View>
    {value ? <AppText variant="small" color={colors.secondary}>{value}</AppText> : null}
    <ChevronRight size={17} color={colors.secondary} />
  </Pressable>;
}

export function BusinessDetailsScreen() {
  return <ShopSettingsEditor section="business" />;
}

export function CurrencyReceiptScreen() {
  return <ShopSettingsEditor section="currency" />;
}

function ShopSettingsEditor({ section }: { section: 'business' | 'currency' }) {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const owner = businessId ?? session?.user.id ?? '';
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [alerts, setAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void getShopSettings(db, owner).then((settings) => {
      if (!active) return;
      setName(settings.shop_name);
      setCurrency(settings.currency);
      setAppCurrency(settings.currency);
      setAlerts(Boolean(settings.low_stock_alerts));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Shop settings could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, owner]);

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await saveShopSettings(db, owner, name, currency, alerts);
      setAppCurrency(currency);
      setMessage('Your shop preferences have been updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Shop settings could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const business = section === 'business';
  return <Page
    title={business ? 'Business Details' : 'Currency & Receipt'}
    subtitle={business ? 'Keep your shop profile up to date.' : 'Choose the currency used for shop totals.'}
    back
  >
    {loading ? <Card><AppText color={colors.secondary}>Loading shop settings…</AppText></Card> : (
      <Card style={{ gap: 14 }}>
        {business ? <>
          <AppText variant="heading">Shop profile</AppText>
          <Field label="Shop name" value={name} onChangeText={(value) => { setName(value); setMessage(''); }} placeholder="Mama's Shop" />
          <Pressable onPress={() => { setAlerts((value) => !value); setMessage(''); }} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: alerts }}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">Low stock reminders</AppText>
              <AppText variant="small" color={colors.secondary}>Highlight products that need restocking</AppText>
            </View>
            <StatusBadge label={alerts ? 'On' : 'Off'} tone={alerts ? 'green' : 'purple'} />
          </Pressable>
        </> : <>
          <AppText variant="heading">Shop currency</AppText>
          <AppText variant="small" color={colors.secondary}>Existing amounts remain unchanged; new totals use this currency.</AppText>
          <View style={styles.wrap}>
            {['USD', 'ZWL', 'ZAR', 'BWP'].map((code) => {
              const selected = currency === code;
              return <Pressable key={code} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { setCurrency(code); setMessage(''); }} style={[styles.chip, selected && styles.selected]}>
                <AppText variant="label" color={selected ? colors.deepPurple : colors.secondary}>{code}</AppText>
              </Pressable>;
            })}
          </View>
          <View style={styles.receiptPreview}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Building2 size={17} color={colors.purple} />
              <AppText variant="label" numberOfLines={1}>{name || "Your shop"}</AppText>
            </View>
            <View style={styles.previewLine}><AppText variant="small" color={colors.secondary}>Receipt total</AppText><AppText variant="label">{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(12.5)}</AppText></View>
          </View>
        </>}
        {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
        {message ? <AppText variant="small" color={colors.success}>{message}</AppText> : null}
        <PrimaryButton label={busy ? 'Saving…' : 'Save changes'} loading={busy} onPress={() => void save()} />
      </Card>
    )}
  </Page>;
}

export function HelpAndSupportScreen() {
  return <Page title="Help & Support" subtitle="A few tips for using Mama's Shop." back>
    <Card style={{ gap: 12 }}>
      <AppText variant="heading">Keep working offline</AppText>
      <AppText color={colors.secondary} style={{ lineHeight: 22 }}>Sales, stock updates, and customer credit are saved on this device first. When the internet returns, queued changes sync automatically.</AppText>
      <SecondaryButton label="Open Offline & Sync" onPress={() => router.push('/settings/sync')} icon={<Wifi size={17} color={colors.deepPurple} />} />
    </Card>
  </Page>;
}

export function AboutScreen() {
  return <Page title="About" subtitle="Mama's Shop" back>
    <Card style={{ gap: 10, alignItems: 'center' }}>
      <View style={styles.aboutIcon}><Store size={28} color={colors.deepPurple} /></View>
      <AppText variant="heading">Mama's Shop</AppText>
      <AppText color={colors.secondary} style={{ textAlign: 'center', lineHeight: 22 }}>A simple way to manage sales, stock, and customer credit—even when you are offline.</AppText>
    </Card>
  </Page>;
}

export function SyncSettingsScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const { connection, syncing, pending, failed, conflicts, lastSyncedAt, unavailable, syncNow, refreshConnection } = useSyncStatus();
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const art = connection === 'offline' ? require('@/assets/images/shop-illustrations/sync/offline.png') : failed || conflicts ? require('@/assets/images/shop-illustrations/sync/sync-failed.png') : pending || syncing ? require('@/assets/images/shop-illustrations/sync/sync-pending.png') : require('@/assets/images/shop-illustrations/sync/sync-complete.png');
  const statusLabel = connection === 'offline' ? 'Offline' : connection === 'checking' ? 'Checking connection' : syncing ? 'Syncing' : conflicts ? 'Review needed' : failed ? 'Retry needed' : pending ? 'Waiting to sync' : 'Up to date';
  const tone = connection === 'offline' || pending ? 'amber' : failed || conflicts ? 'red' : connection === 'online' ? 'green' : 'blue';
  const checkConnectionNow = async () => {
    setCheckingConnection(true);
    setConnectionError('');
    try {
      await refreshConnection();
    } catch (reason) {
      setConnectionError(reason instanceof Error ? reason.message : 'Could not check the connection.');
    } finally {
      setCheckingConnection(false);
    }
  };

  if (connection === 'offline') {
    return <Page title="Offline Mode" subtitle="Your shop is still ready to use." back>
      <Card style={{ alignItems: 'center', gap: 13, padding: 18 }}>
        <View style={styles.offlineIcon}><WifiOff size={34} color={colors.deepPurple} /></View>
        <AppText variant="heading" color={colors.deepPurple} style={{ textAlign: 'center' }}>You're Offline</AppText>
        <AppText color={colors.secondary} style={{ textAlign: 'center', lineHeight: 21 }}>No internet connection. You can still use the app and your data will sync automatically when you're back online.</AppText>
        <View style={styles.offlineChecklist}>
          {['Sales can be recorded', 'Stock will be updated', 'Customer credit will be saved', 'Data will sync when online'].map((item) => <View key={item} style={styles.offlineCheckRow}><Check size={15} color={colors.success} /><AppText variant="small" color={colors.secondary}>{item}</AppText></View>)}
        </View>
        {connectionError ? <AppText variant="small" color={colors.danger}>{connectionError}</AppText> : null}
        <PrimaryButton label="Continue" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        <Pressable accessibilityRole="button" disabled={checkingConnection} onPress={() => void checkConnectionNow()} style={styles.checkConnectionButton}>
          <AppText variant="label" color={colors.deepPurple}>{checkingConnection ? 'Checking connection…' : 'Check Connection'}</AppText>
        </Pressable>
      </Card>
    </Page>;
  }

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
  settingsRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  receiptPreview: { gap: 13, padding: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 13, backgroundColor: '#FAFAFE' },
  previewLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 10 },
  aboutIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.lavenderTint },
  offlineIcon: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 46, backgroundColor: '#EAF2FF' },
  offlineChecklist: { alignSelf: 'stretch', gap: 10, padding: 13, borderRadius: 13, backgroundColor: '#F2F7FF' },
  offlineCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkConnectionButton: { minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.info, borderRadius: 14 },
  syncLink: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: '#FFFFFF' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  conflictRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
