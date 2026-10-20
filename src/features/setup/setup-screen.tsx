import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Building2, Check, ChevronRight, Store, WandSparkles } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { AppText, Card, Field, LoadingScreen, Page, PrimaryButton, SecondaryButton } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/lib/supabase';
import { clearSetupDraft, getSetupDraft, getShopSettings, hasLocalShopData, saveSetupDraft, saveShopSettings } from '@/db/repositories/settings';
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
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [shops, setShops] = useState<JoinableShop[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const draftSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    let active = true;
    void Promise.all([getShopSettings(db, ownerId), getSetupDraft(db, session?.user.id ?? ownerId)]).then(([settings, draft]) => {
      if (!active) return;
      setName(draft?.shop_name ?? settings.shop_name);
      setCurrency(currencies.includes(draft?.currency ?? settings.currency) ? (draft?.currency ?? settings.currency) : 'USD');
      setMode(draft?.mode ?? 'create');
      setSelectedShop(draft?.selected_owner_id ?? null);
      if (draft?.mode === 'join') void loadShops();
      setDraftReady(true);
    }).catch(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [db, loadShops, ownerId, session?.user.id]);

  useEffect(() => {
    if (!draftReady || !session?.user.id) return;
    draftSaveTimeout.current = setTimeout(() => {
      draftSaveTimeout.current = null;
      void saveSetupDraft(db, session.user.id, { shop_name: name, currency, mode, selected_owner_id: selectedShop });
    }, 250);
    return () => {
      if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
      draftSaveTimeout.current = null;
    };
  }, [db, draftReady, session?.user.id, name, currency, mode, selectedShop]);

  const finish = async () => {
    if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    draftSaveTimeout.current = null;
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
      await clearSetupDraft(db, session.user.id);
      router.replace('/(tabs)');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'We could not finish setting up your shop. Please try again.');
    } finally { setBusy(false); }
  };

  const joinShop = async () => {
    if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    draftSaveTimeout.current = null;
    if (!selectedShop) { setError('Choose a shop to join.'); return; }
    if (!session) { setError('Sign in before joining a shop.'); return; }
    setError('');
    setBusy(true);
    try {
      if (await hasLocalShopData(db, session.user.id)) {
        throw new Error('This account already has shop data on this device. Use a separate staff account so your records stay with your shop.');
      }
      if (!supabase) throw new Error('Joining a shop needs an internet connection and a configured account.');
      const client = supabase;
      const { data, error: joinError } = await client.rpc('join_business_by_owner', { p_owner_id: selectedShop });
      if (joinError) throw joinError;
      const joined = (data?.[0] ?? null) as JoinableShop | null;
      if (!joined?.owner_id) throw new Error('The shop is no longer accepting members. Refresh the list and try again.');
      await setActiveBusiness(joined.owner_id);
      await clearSetupDraft(db, session.user.id);
      router.replace('/(tabs)');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not join this shop. Please try again.');
      await loadShops();
    } finally { setBusy(false); }
  };

  const continueSetup = () => {
    setError('');
    if (mode === 'create' && !name.trim()) {
      setError('Enter your shop name to continue.');
      return;
    }
    if (mode === 'join' && !selectedShop) {
      setError('Choose a shop to continue.');
      return;
    }
    setStep(2);
  };

  const selectedShopDetails = shops.find((shop) => shop.owner_id === selectedShop);
  const ctaLabel = busy ? (mode === 'create' ? 'Creating your shop…' : 'Joining shop…') : step === 1 ? 'Continue to review' : mode === 'create' ? 'Create my shop' : 'Join selected shop';
  const ctaDisabled = mode === 'join' && step === 1 && shopsLoading;

  useEffect(() => {
    if (!__DEV__) return;
    console.log('[ShopSetup] CTA state', {
      mode,
      step,
      label: ctaLabel,
      disabled: ctaDisabled,
      loading: busy,
      backgroundColor: colors.deepPurple,
    });
  }, [busy, ctaDisabled, ctaLabel, mode, step]);

  const handleCtaPress = () => {
    if (__DEV__) console.log('[ShopSetup] CTA pressed', { mode, step, disabled: ctaDisabled });
    if (step === 1) continueSetup();
    else if (mode === 'create') void finish();
    else void joinShop();
  };

  if (loading) return <LoadingScreen label="Preparing your shop setup…" />;

  return <Page title="Set up your shop" subtitle="Create a shop or join one that is accepting team members." contentStyle={{ gap: 12, paddingTop: 8, paddingBottom: 12 }}>
    <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
    <View className="flex-row items-center justify-between">
      <AppText variant="small" color={colors.secondary}>Step {step} of 2</AppText>
      <AppText variant="small" color={colors.deepPurple}>{step === 1 ? (mode === 'create' ? 'Shop details' : 'Choose a shop') : 'Review'}</AppText>
    </View>
    <View className="h-1.5 flex-row gap-1 overflow-hidden rounded-full bg-canvas">
      <View className="flex-1 rounded-full bg-brand" />
      <View className={`flex-1 rounded-full ${step === 2 ? 'bg-gold' : 'bg-line'}`} />
    </View>
    </View>
    <Card className="flex-row items-center gap-3 p-4">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint"><Store size={22} stroke={colors.deepPurple} /></View>
      <View className="min-w-0 flex-1 gap-0.5">
        <AppText variant="small" color={colors.deepPurple}>SHOP SETUP</AppText>
        <AppText variant="heading">Welcome to Mama’s Shop</AppText>
        <AppText variant="small" color={colors.secondary}>Stock, sales, and customer records in one place.</AppText>
      </View>
    </Card>

    <View className="flex-row gap-1 rounded-2xl border border-line bg-surface p-1">
      {(['create', 'join'] as const).map((option) => {
        const active = mode === option;
        return <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => {
          setMode(option); setStep(1); setError('');
          if (option === 'join' && shops.length === 0 && !shopsLoading) void loadShops();
        }} className={`min-h-12 flex-1 items-center justify-center rounded-xl ${active ? 'bg-brand-tint' : ''}`}>
          <AppText variant="label" color={active ? colors.deepPurple : colors.secondary}>{option === 'create' ? 'Create a shop' : 'Join a shop'}</AppText>
        </Pressable>;
      })}
    </View>

    {mode === 'create' ? <Card className="gap-4 p-4">
      <View className="flex-row items-center gap-2"><Building2 size={19} color={colors.purple} /><AppText variant="heading">{step === 1 ? 'Your shop details' : 'Review your shop'}</AppText></View>
      {step === 1 ? <>
        <Field label="Shop name" placeholder="e.g. Mama’s Corner Shop" value={name} onChangeText={(value) => { setName(value); if (error) setError(''); }} autoCapitalize="words" returnKeyType="done" />
      </> : <View className="gap-3 rounded-2xl bg-canvas p-4">
        <View className="flex-row items-center gap-3"><View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-tint"><Store size={20} color={colors.deepPurple} /></View><View className="flex-1 gap-0.5"><AppText variant="small" color={colors.secondary}>SHOP NAME</AppText><AppText variant="label">{name.trim()}</AppText></View></View>
        <View className="h-px bg-line" />
        <View className="gap-2">
          <AppText variant="label">Shop currency</AppText>
          <View className="flex-row flex-wrap gap-2">{currencies.map((code) => { const selected = currency === code; return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} key={code} onPress={() => setCurrency(code)} className={`min-h-11 items-center justify-center rounded-xl border px-4 ${selected ? 'border-brand bg-brand-tint' : 'border-line bg-surface'}`}><AppText variant="label" color={selected ? colors.deepPurple : colors.secondary}>{code}</AppText></Pressable>; })}</View>
          <AppText variant="small" color={colors.secondary}>You can change this later in Settings.</AppText>
        </View>
        <AppText variant="small" color={colors.secondary}>Your shop dashboard will open after creation.</AppText>
      </View>}
      <View className="gap-2 border-t border-line pt-4">
        {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
        {step === 2 ? <SecondaryButton label="Back to shop details" onPress={() => { setStep(1); setError(''); }} /> : null}
        <PrimaryButton
          label={ctaLabel}
          loading={busy}
          onPress={handleCtaPress}
          icon={step === 1 ? <ChevronRight size={18} stroke={colors.surface} /> : <WandSparkles size={17} stroke={colors.surface} />}
          disabled={ctaDisabled}
          onLayout={(event) => {
            if (__DEV__) console.log('[ShopSetup] CTA layout', event.nativeEvent.layout);
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Card> : <Card className="gap-4 p-4">
      <View className="flex-row items-center gap-2"><Building2 size={19} color={colors.purple} /><AppText variant="heading">{step === 1 ? 'Choose a shop' : 'Review your selection'}</AppText></View>
      {step === 1 ? <>
      <AppText variant="small" color={colors.secondary}>Only shops that are currently accepting team members appear here.</AppText>
      {shopsLoading ? <LoadingScreen label="Finding shops…" /> : shops.length ? <View className="gap-2">
        {shops.map((shop) => {
          const selected = selectedShop === shop.owner_id;
          return <Pressable key={shop.owner_id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { setSelectedShop(shop.owner_id); setError(''); }} className={`min-h-16 flex-row items-center gap-3 rounded-2xl border p-3 ${selected ? 'border-brand bg-brand-tint' : 'border-line bg-surface'}`}>
            <View className={`h-10 w-10 items-center justify-center rounded-xl ${selected ? 'bg-surface' : 'bg-canvas'}`}><Store size={18} color={selected ? colors.deepPurple : colors.secondary} /></View>
            <View className="min-w-0 flex-1 gap-0.5"><AppText variant="label">{shop.business_name}</AppText><AppText variant="small" color={colors.secondary}>Open to team members</AppText></View>
            {selected ? <Check size={19} color={colors.purple} /> : <ChevronRight size={18} color={colors.secondary} />}
          </Pressable>;
        })}
      </View> : <View className="items-center gap-2 rounded-2xl bg-canvas p-5"><View className="mb-1 h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint"><Store size={22} color={colors.purple} /></View><AppText variant="label">No shops available right now</AppText><AppText variant="small" color={colors.secondary} style={{ textAlign: 'center' }}>Ask the shop owner to enable team invitations, then refresh.</AppText></View>}
      <Pressable onPress={() => void loadShops()} disabled={shopsLoading || busy} className="min-h-10 items-center justify-center"><AppText variant="label" color={colors.purple}>Refresh shop list</AppText></Pressable>
      </> : <View className="gap-3 rounded-2xl bg-canvas p-4">
        <View className="flex-row items-center gap-3"><View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-tint"><Store size={20} color={colors.deepPurple} /></View><View className="flex-1 gap-0.5"><AppText variant="small" color={colors.secondary}>SELECTED SHOP</AppText><AppText variant="label">{selectedShopDetails?.business_name ?? 'Selected shop'}</AppText></View><Check size={20} color={colors.success} /></View>
        <AppText variant="small" color={colors.secondary}>You’ll open this shop’s dashboard after joining.</AppText>
      </View>}
      <View className="gap-2 border-t border-line pt-4">
        {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
        {step === 2 ? <SecondaryButton label="Back to shop list" onPress={() => { setStep(1); setError(''); }} /> : null}
        <PrimaryButton
          label={ctaLabel}
          loading={busy}
          disabled={ctaDisabled}
          onPress={handleCtaPress}
          icon={step === 1 ? <ChevronRight size={18} stroke={colors.surface} /> : <Check size={17} stroke={colors.surface} />}
          onLayout={(event) => {
            if (__DEV__) console.log('[ShopSetup] CTA layout', event.nativeEvent.layout);
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Card>}
  </Page>;
}
