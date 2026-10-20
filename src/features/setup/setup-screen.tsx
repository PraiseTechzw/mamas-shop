import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Store, WandSparkles } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { AppText, Card, Field, Page, PrimaryButton } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/auth-context';
import { getShopSettings, saveShopSettings } from '@/db/repositories/settings';
import { ensurePrimaryLocation } from '@/db/repositories/inventory';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { setAppCurrency } from '@/lib/format';

const currencies = ['USD', 'ZWL', 'ZAR', 'BWP'];

export function ShopSetupScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void getShopSettings(db, ownerId).then((settings) => setCurrency(currencies.includes(settings.currency) ? settings.currency : 'USD')); }, [db, ownerId]);
  const finish = async () => {
    setError('');
    const cleanName = name.trim();
    if (!cleanName) { setError('Enter your shop name to continue.'); return; }
    if (!ownerId || !session) { setError('Sign in first so this shop belongs to your account.'); return; }
    setBusy(true);
    try {
      await saveShopSettings(db, ownerId, cleanName, currency, true);
      setAppCurrency(currency);
      await ensurePrimaryLocation(db, ownerId);
      const ownerName = String(session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Shop owner');
      await ensureOwnerSeller(db, ownerId, ownerName);
      Alert.alert('Shop ready', cleanName + ' is set up. Add your first products to start selling.');
      router.replace('/(tabs)');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'We could not finish setting up your shop. Please try again.');
    } finally { setBusy(false); }
  };
  return <Page title="Set up your shop" subtitle="Name your shop and pick the currency you sell in. Everything works offline first.">
    <Card style={styles.heroCard}><View style={styles.heroIcon}><Store size={24} stroke={colors.deepPurple} /></View><AppText variant="heading">Welcome to Mama’s Shop</AppText><AppText color={colors.secondary}>This takes about a minute. We create your main stock location and owner profile, so you can start recording sales and stock straight away.</AppText></Card>
    <Card style={styles.formCard}>
      <Field label="Shop name" placeholder="e.g. Mama’s Corner Shop" value={name} onChangeText={(value) => { setName(value); if (error) setError(''); }} autoCapitalize="words" returnKeyType="done" />
      <View style={styles.currencyBlock}>
        <AppText variant="label">Currency</AppText>
        <View style={styles.chips}>{currencies.map((code) => { const selected = currency === code; return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} key={code} onPress={() => setCurrency(code)} style={[styles.chip, selected && styles.chipSelected]}><AppText variant="label" color={selected ? colors.deepPurple : colors.secondary}>{code}</AppText></Pressable>; })}</View>
        <AppText variant="small" color={colors.secondary}>Prices are stored in minor units (cents) and shown with this currency everywhere.</AppText>
      </View>
      {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
      <PrimaryButton label="Finish setup" loading={busy} onPress={() => void finish()} icon={<WandSparkles size={17} stroke="#FFFFFF" />} />
    </Card>
  </Page>;
}

const styles = StyleSheet.create({
  heroCard: { gap: 10, alignItems: 'flex-start', padding: 16 },
  heroIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.lavenderTint, alignItems: 'center', justifyContent: 'center' },
  formCard: { gap: 14, padding: 16 },
  currencyBlock: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#FFFFFF' },
  chipSelected: { borderColor: colors.purple, backgroundColor: colors.lavenderTint },
});
