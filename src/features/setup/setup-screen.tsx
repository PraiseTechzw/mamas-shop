import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Building2, Check, ChevronRight, Store, WandSparkles } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { AppText, Card, Field, LoadingScreen, Page, PrimaryButton } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/lib/supabase';
import { getShopSettings, saveShopSettings } from '@/db/repositories/settings';
import { ensurePrimaryLocation } from '@/db/repositories/inventory';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { setAppCurrency } from '@/lib/format';

const currencies = ['USD', 'ZWL', 'ZAR', 'BWP'];
type JoinableShop = { owner_id: string; business_name: string };
type SetupMode = 'create' | 'join';

export function ShopSetupScreen() {
  const db = useSQLiteContext();
  const { session, businessId, loading, setActiveBusiness } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const [mode, setMode] = useState<SetupMode>('create');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [shops, setShops] = useState<JoinableShop[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadShops = useCallback(async () => {
    setShopsLoading(true);
    setError('');
    try {
      if (!supabase) throw new Error('Shop discovery needs an internet connection and a configured account.');
      const client = supabase;
      const { data, error: resultError } = await client.rpc('list_joinable_businesses');
      if (resultError) throw resultError;
      setShops((data ?? []) as JoinableShop[]);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not load shops. Check your connection and try again.');
    } finally {
      setShopsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    void getShopSettings(db, ownerId).then((settings) => {
      setName(settings.shop_name);
      setCurrency(currencies.includes(settings.currency) ? settings.currency : 'USD');
    });
  }, [db, ownerId]);

  useEffect(() => {
    if (!loading && session && businessId && businessId !== session.user.id) router.replace('/(tabs)');
  }, [loading, session, businessId]);

  const finish = async () => {
    setError('');
    const cleanName = name.trim();
    if (!cleanName) { setError('Enter your shop name to continue.'); return; }
    if (!session) { setError('Sign in first so this shop belongs to your account.'); return; }
    if (businessId && businessId !== session.user.id) { router.replace('/(tabs)'); return; }
    setBusy(true);
    try {
      await saveShopSettings(db, session.user.id, cleanName, currency, true);
      setAppCurrency(currency);
      await ensurePrimaryLocation(db, session.user.id);
      const ownerName = String(session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Shop owner');
      await ensureOwnerSeller(db, session.user.id, ownerName);
      router.replace('/(tabs)');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'We could not finish setting up your shop. Please try again.');
    } finally { setBusy(false); }
  };

  const joinShop = async () => {
    if (!selectedShop) { setError('Choose a shop to join.'); return; }
    setError('');
    setBusy(true);
    try {
      if (!supabase) throw new Error('Joining a shop needs an internet connection and a configured account.');
      const client = supabase;
      const { data, error: joinError } = await client.rpc('join_business_by_owner', { p_owner_id: selectedShop });
      if (joinError) throw joinError;
      const joined = (data?.[0] ?? null) as JoinableShop | null;
      if (!joined?.owner_id) throw new Error('The shop is no longer accepting members. Refresh the list and try again.');
      await setActiveBusiness(joined.owner_id);
      router.replace('/(tabs)');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not join this shop. Please try again.');
      await loadShops();
    } finally { setBusy(false); }
  };

  if (loading) return <LoadingScreen label="Preparing your shop setup…" />;

  return <Page title="Set up your shop" subtitle="Create a shop or join one that is accepting team members.">
    <Card style={styles.heroCard}>
      <View style={styles.heroIcon}><Store size={24} stroke={colors.deepPurple} /></View>
      <AppText variant="heading">Welcome to Mama’s Shop</AppText>
      <AppText color={colors.secondary}>One quick step before you start. Your shop keeps its own stock, sales, and customer records.</AppText>
    </Card>

    <View style={styles.modeSwitch}>
      {(['create', 'join'] as const).map((option) => {
        const active = mode === option;
        return <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => {
          setMode(option); setError('');
          if (option === 'join' && shops.length === 0 && !shopsLoading) void loadShops();
        }} style={[styles.modeButton, active && styles.modeButtonActive]}>
          <AppText variant="label" color={active ? colors.deepPurple : colors.secondary}>{option === 'create' ? 'Create a shop' : 'Join a shop'}</AppText>
        </Pressable>;
      })}
    </View>

    {mode === 'create' ? <Card style={styles.formCard}>
      <View style={styles.sectionHeading}><Building2 size={18} color={colors.purple} /><AppText variant="heading">Your shop details</AppText></View>
      <Field label="Shop name" placeholder="e.g. Mama’s Corner Shop" value={name} onChangeText={(value) => { setName(value); if (error) setError(''); }} autoCapitalize="words" returnKeyType="done" />
      <View style={styles.currencyBlock}>
        <AppText variant="label">Shop currency</AppText>
        <View style={styles.chips}>{currencies.map((code) => { const selected = currency === code; return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} key={code} onPress={() => setCurrency(code)} style={[styles.chip, selected && styles.chipSelected]}><AppText variant="label" color={selected ? colors.deepPurple : colors.secondary}>{code}</AppText></Pressable>; })}</View>
        <AppText variant="small" color={colors.secondary}>You can change this later in Settings.</AppText>
      </View>
      {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
      <PrimaryButton label="Create my shop" loading={busy} onPress={() => void finish()} icon={<WandSparkles size={17} stroke="#FFFFFF" />} />
    </Card> : <Card style={styles.formCard}>
      <View style={styles.sectionHeading}><Building2 size={18} color={colors.purple} /><AppText variant="heading">Choose a shop</AppText></View>
      <AppText variant="small" color={colors.secondary}>Only shops that are currently accepting team members appear here.</AppText>
      {shopsLoading ? <LoadingScreen label="Finding shops…" /> : shops.length ? <View style={styles.shopList}>
        {shops.map((shop) => {
          const selected = selectedShop === shop.owner_id;
          return <Pressable key={shop.owner_id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { setSelectedShop(shop.owner_id); setError(''); }} style={[styles.shopRow, selected && styles.shopRowSelected]}>
            <View style={[styles.shopIcon, selected && styles.shopIconSelected]}><Store size={18} color={selected ? colors.deepPurple : colors.secondary} /></View>
            <View style={styles.shopName}><AppText variant="label">{shop.business_name}</AppText><AppText variant="small" color={colors.secondary}>Invited team shop</AppText></View>
            {selected ? <Check size={19} color={colors.purple} /> : <ChevronRight size={18} color={colors.secondary} />}
          </Pressable>;
        })}
      </View> : <View style={styles.emptyState}><AppText variant="label">No shops available right now</AppText><AppText variant="small" color={colors.secondary}>Ask the shop owner to enable team invitations, then refresh.</AppText></View>}
      {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
      <PrimaryButton label="Join selected shop" loading={busy} disabled={!selectedShop || shopsLoading} onPress={() => void joinShop()} icon={<Check size={17} stroke="#FFFFFF" />} />
      <Pressable onPress={() => void loadShops()} disabled={shopsLoading || busy} style={styles.refresh}><AppText variant="label" color={colors.purple}>Refresh shop list</AppText></Pressable>
    </Card>}
  </Page>;
}

const styles = StyleSheet.create({
  heroCard: { gap: 10, alignItems: 'flex-start', padding: 16 },
  heroIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.lavenderTint, alignItems: 'center', justifyContent: 'center' },
  modeSwitch: { flexDirection: 'row', padding: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, gap: 4 },
  modeButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  modeButtonActive: { backgroundColor: colors.lavenderTint },
  formCard: { gap: 14, padding: 16 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  currencyBlock: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.purple, backgroundColor: colors.lavenderTint },
  shopList: { gap: 8 },
  shopRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  shopRowSelected: { borderColor: colors.purple, backgroundColor: colors.lavenderTint },
  shopIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.background },
  shopIconSelected: { backgroundColor: colors.surface },
  shopName: { flex: 1, gap: 3 },
  emptyState: { gap: 6, padding: 16, alignItems: 'center', borderRadius: 14, backgroundColor: colors.background },
  refresh: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
});
