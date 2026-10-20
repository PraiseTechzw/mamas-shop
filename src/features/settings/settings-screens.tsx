import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Banknote, Building2, Check, ChevronDown, ChevronRight, CircleHelp, Database, Info, Languages, LogOut, Package, ShoppingBag, Store, Users, Wifi, WifiOff } from 'lucide-react-native';
import { useAuth } from '@/features/auth/auth-context';
import { getShopSettings, saveShopSettings } from '@/db/repositories/settings';
import { colors } from '@/constants/theme';
import { formatDateTime, setAppCurrency } from '@/lib/format';
import { AppText, Card, Field, Page, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/ui/primitives';
import { useSyncStatus } from '@/features/sync/sync-context';
import { retrySyncConflicts } from '@/services/sync-engine';
import { supabase } from '@/lib/supabase';

export function SettingsScreen() {
  const signOut = async () => {
    const result = await supabase?.auth.signOut();
    if (result?.error) Alert.alert('Could not sign out', result.error.message);
    else router.replace('/(auth)/welcome');
  };
  const openBackupInfo = () => Alert.alert(
    'Backup & Restore',
    'Manual backup and restore is not available yet. Signed-in shops sync changes to the cloud when a connection is available.',
    [{ text: 'View sync status', onPress: () => router.push('/settings/sync') }, { text: 'Close', style: 'cancel' }],
  );
  const showLanguageInfo = () => Alert.alert('Language', 'English is currently the available app language.');

  return <Page title="Settings" subtitle="Manage your shop and app preferences.">
    <Card style={{ gap: 2, paddingVertical: 5 }}>
      <SettingsRow title="Business Details" subtitle="Shop name and stock reminders" icon={Store} onPress={() => router.push('/settings/business')} />
      <SettingsRow title="Currency & Receipt" subtitle="Set your currency and preview receipt totals" icon={Banknote} onPress={() => router.push('/settings/currency')} />
      <SettingsRow title="Offline & Sync" subtitle="Local saves and cloud sync status" icon={Wifi} onPress={() => router.push('/settings/sync')} />
      <SettingsRow title="Backup & Restore" subtitle="Learn how your shop data is kept safe" icon={Database} onPress={openBackupInfo} />
      <SettingsRow title="Language" subtitle="Choose the app language" icon={Languages} value="English" onPress={showLanguageInfo} />
      <SettingsRow title="Help & Support" subtitle="Offline use and sync guidance" icon={CircleHelp} onPress={() => router.push('/settings/help')} />
      <SettingsRow title="About" subtitle="About Mama's Shop" icon={Info} onPress={() => router.push('/settings/about')} />
    </Card>
    <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signout}><LogOut size={18} color={colors.danger} /><AppText variant="label" color={colors.danger}>Log out</AppText></Pressable>
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
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(0);
  const answers = [
    { question: 'Can I use the app without internet?', answer: 'Yes. Sales, stock updates, and customer credit save on this device first. You can keep working while offline; saved changes sync when a connection returns.' },
    { question: 'Where can I check whether my changes synced?', answer: 'Open Offline & Sync to see your connection, queued changes, and any items that need review. You can retry a sync when you are online.' },
    { question: 'How do I record a customer payment?', answer: 'Open Customers, select the customer, and use Record Repayment. The payment is saved to the customer’s account history.' },
    { question: 'How do I update product quantities?', answer: 'Open Inventory and choose the product action for receiving stock or correcting a count. Stock changes are kept in the product history.' },
  ];

  return <Page title="Help & Support" subtitle="Quick answers to help you run your shop." back>
    <View className="gap-4">
      <View className="overflow-hidden rounded-3xl bg-brand px-5 py-5">
        <View className="mb-4 h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
          <CircleHelp size={23} color="#FFFFFF" />
        </View>
        <AppText variant="heading" color="#FFFFFF">How can we help?</AppText>
        <AppText color="#EDEAFF" style={{ marginTop: 5, lineHeight: 21 }}>Find quick guidance for everyday shop tasks and offline use.</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings/sync')} className="mt-4 min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-white px-4 active:opacity-80">
          <Wifi size={17} color={colors.deepPurple} />
          <AppText variant="label" color={colors.deepPurple}>Check sync status</AppText>
          <ChevronRight size={17} color={colors.deepPurple} />
        </Pressable>
      </View>

      <View className="gap-2">
        <AppText variant="heading">Browse help</AppText>
        <View className="overflow-hidden rounded-2xl border border-line bg-surface">
          <HelpTopic icon={ShoppingBag} title="Sales" subtitle="Record a sale and take payment" />
          <HelpTopic icon={Package} title="Inventory" subtitle="Receive stock and adjust quantities" />
          <HelpTopic icon={Users} title="Customer credit" subtitle="Manage balances and repayments" last />
        </View>
      </View>

      <View className="gap-2">
        <AppText variant="heading">Frequently asked questions</AppText>
        <View className="overflow-hidden rounded-2xl border border-line bg-surface px-4">
          {answers.map(({ question, answer }, index) => {
            const expanded = expandedQuestion === index;
            return <Pressable
              key={question}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpandedQuestion(expanded ? null : index)}
              className={`py-3.5 ${index < answers.length - 1 ? 'border-b border-line' : ''}`}
            >
              <View className="flex-row items-center justify-between gap-3">
                <AppText variant="label" style={{ flex: 1 }}>{question}</AppText>
                <ChevronDown size={18} color={colors.secondary} />
              </View>
              {expanded ? <AppText color={colors.secondary} style={{ marginTop: 9, lineHeight: 21 }}>{answer}</AppText> : null}
            </Pressable>;
          })}
        </View>
      </View>
    </View>
  </Page>;
}

function HelpTopic({ icon: Icon, title, subtitle, last = false }: { icon: typeof ShoppingBag; title: string; subtitle: string; last?: boolean }) {
  return <View className={`flex-row items-center gap-3 px-4 py-3 ${last ? '' : 'border-b border-line'}`}>
    <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint"><Icon size={18} color={colors.deepPurple} /></View>
    <View className="min-w-0 flex-1 gap-0.5"><AppText variant="label">{title}</AppText><AppText variant="small" color={colors.secondary}>{subtitle}</AppText></View>
  </View>;
}

export function AboutScreen() {
  return <Page title="About" subtitle="Mama's Shop" back>
    <Card style={{ gap: 10, alignItems: 'center' }}>
      <View style={styles.aboutIcon}><Store size={28} color={colors.deepPurple} /></View>
      <AppText variant="heading">Mama&apos;s Shop</AppText>
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
        <AppText variant="heading" color={colors.deepPurple} style={{ textAlign: 'center' }}>You&apos;re Offline</AppText>
        <AppText color={colors.secondary} style={{ textAlign: 'center', lineHeight: 21 }}>No internet connection. You can still use the app and your data will sync automatically when you&apos;re back online.</AppText>
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

  const art = failed || conflicts ? require('@/assets/images/shop-illustrations/sync/sync-failed.png') : pending || syncing ? require('@/assets/images/shop-illustrations/sync/sync-pending.png') : require('@/assets/images/shop-illustrations/sync/sync-complete.png');
  const statusLabel = connection === 'checking' ? 'Checking connection' : syncing ? 'Syncing' : conflicts ? 'Review needed' : failed ? 'Retry needed' : pending ? 'Waiting to sync' : 'Up to date';
  const tone = pending ? 'amber' : failed || conflicts ? 'red' : connection === 'online' ? 'green' : 'blue';

  return <Page title="Sync status" subtitle="Changes save here first, then sync to your signed-in shop." back>
    <Card style={{ alignItems: 'center', gap: 11 }}>
      <Image source={art} resizeMode="contain" style={{ width: 144, height: 128 }} accessibilityLabel="Illustration of shop connection and syncing" />
      <StatusBadge label={statusLabel} tone={tone} />
      <AppText variant="heading" style={{ textAlign: 'center' }}>{pending === 0 ? 'Your saved changes are up to date' : `${pending} saved ${pending === 1 ? 'change' : 'changes'} waiting`}</AppText>
      <AppText color={colors.secondary} style={{ textAlign: 'center', lineHeight: 21 }}>{unavailable === 'not-configured' ? 'Your records are safe on this device. Add the Supabase project connection and apply the sync migrations to enable cloud backup.' : conflicts ? `${conflicts} incoming change${conflicts === 1 ? '' : 's'} could not be applied safely. Review the conflict details below.` : failed ? `${failed} change${failed === 1 ? '' : 's'} could not upload yet. The app will retry when a connection is available.` : 'Changes upload and download for this signed-in shop. Financial and stock history is kept as individual events.'}</AppText>
      {lastSyncedAt ? <AppText variant="small" color={colors.secondary}>Last successful sync · {formatDateTime(lastSyncedAt)}</AppText> : null}
      <PrimaryButton label={syncing ? 'Syncing…' : 'Sync now'} loading={syncing} disabled={connection !== 'online' || Boolean(unavailable)} onPress={() => void syncNow(true)} style={{ alignSelf: 'stretch' }} />
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
  signout: { minHeight: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, backgroundColor: colors.dangerTint, borderRadius: 14 },
  receiptPreview: { gap: 13, padding: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 13, backgroundColor: '#FAFAFE' },
  previewLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 10 },
  aboutIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.lavenderTint },
  offlineIcon: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 46, backgroundColor: '#EAF2FF' },
  offlineChecklist: { alignSelf: 'stretch', gap: 10, padding: 13, borderRadius: 13, backgroundColor: '#F2F7FF' },
  offlineCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkConnectionButton: { minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.info, borderRadius: 14 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  conflictRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
