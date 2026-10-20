import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AlertTriangle, Banknote, ChevronRight, CreditCard, Package, ShoppingCart, Users } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { formatMoney } from '@/lib/format';
import { getDashboardData, type DashboardData } from '@/db/repositories/dashboard';
import { needsShopSetup } from '@/db/repositories/settings';
import { useAuth } from '@/features/auth/auth-context';
import { AppText, Card } from '@/components/ui/primitives';
import { useSyncStatus } from '@/features/sync/sync-context';

const emptyData: DashboardData = {
  salesTodayCents: 0,
  salesTodayCount: 0,
  cashReceivedTodayCents: 0,
  cashPaymentsTodayCount: 0,
  creditGivenTodayCents: 0,
  creditSalesTodayCount: 0,
  creditOutstandingCents: 0,
  owingCustomerCount: 0,
  changeOwedOpenCents: 0,
  lowStockCount: 0,
};

export function DashboardScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const { revision } = useSyncStatus();
  const [data, setData] = useState(emptyData);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const ownerId = businessId ?? session?.user.id ?? '';
      if (session && businessId === session.user.id && await needsShopSetup(db, ownerId)) {
        router.replace('/setup');
        return;
      }
      setData(await getDashboardData(db, ownerId));
    } finally {
      setRefreshing(false);
    }
  }, [db, businessId, session]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh local totals when the dashboard opens or a synced event arrives.
  useEffect(() => { void load(); }, [load, revision]);

  return <ScrollView className="flex-1 bg-canvas" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.purple} />} contentContainerStyle={styles.page}>
    <View style={styles.metrics}>
      <MetricCard title="Total Sales" value={formatMoney(data.salesTodayCents)} detail={`${data.salesTodayCount} ${data.salesTodayCount === 1 ? 'sale' : 'sales'} today`} icon={<Banknote size={17} stroke="#2563EB" />} tone="blue" />
      <MetricCard title="Cash Received" value={formatMoney(data.cashReceivedTodayCents)} detail={`${data.cashPaymentsTodayCount} cash ${data.cashPaymentsTodayCount === 1 ? 'payment' : 'payments'}`} icon={<Banknote size={17} stroke="#2563EB" />} tone="blue" />
      <MetricCard title="Credit Given" value={formatMoney(data.creditGivenTodayCents)} detail={`${data.creditSalesTodayCount} credit ${data.creditSalesTodayCount === 1 ? 'sale' : 'sales'} today`} icon={<Users size={17} stroke="#2563EB" />} tone="blue" />
      <MetricCard title="Outstanding Credit" value={formatMoney(data.creditOutstandingCents)} detail={`${data.owingCustomerCount} ${data.owingCustomerCount === 1 ? 'customer' : 'customers'}`} icon={<CreditCard size={17} stroke="#EF4444" />} tone="red" onPress={() => router.push('/(tabs)/credit')} />
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel={`${data.lowStockCount} low stock items. Open inventory`} onPress={() => router.push('/(tabs)/inventory')} style={({ pressed }) => [styles.stockAlert, data.lowStockCount === 0 && styles.stockAlertClear, pressed && styles.pressed]}>
      <View style={[styles.alertIcon, data.lowStockCount === 0 && styles.alertIconClear]}><AlertTriangle size={17} fill={data.lowStockCount === 0 ? 'transparent' : '#F97316'} stroke={data.lowStockCount === 0 ? '#16865D' : '#FFFFFF'} /></View>
      <View style={styles.alertCopy}>
        <AppText variant="label" color={data.lowStockCount === 0 ? colors.success : '#D94328'}>{data.lowStockCount === 0 ? 'Stock looks good' : 'Low Stock Alert'}</AppText>
        <AppText variant="small" color={colors.secondary}>{data.lowStockCount === 0 ? 'All products are above their minimum level' : `${data.lowStockCount} ${data.lowStockCount === 1 ? 'item is' : 'items are'} below minimum stock level`}</AppText>
      </View>
      <ChevronRight size={18} stroke={colors.secondary} />
    </Pressable>

    <AppText variant="heading" style={styles.sectionTitle}>Quick Actions</AppText>
    <View style={styles.actions}>
      <QuickAction title="New Sale" icon={<ShoppingCart size={21} stroke="#FFFFFF" />} tone="sale" onPress={() => router.push('/(tabs)/sales')} />
      <QuickAction title="Add Stock" icon={<Package size={21} stroke="#202033" />} tone="stock" onPress={() => router.push('/inventory/receive-stock')} />
      <QuickAction title="Customers" icon={<Users size={21} stroke="#155EEF" />} tone="customers" onPress={() => router.push('/(tabs)/credit')} />
    </View>
  </ScrollView>;
}

function MetricCard({ title, value, detail, icon, tone, onPress }: { title: string; value: string; detail: string; icon: React.ReactNode; tone: 'blue' | 'red'; onPress?: () => void }) {
  const card = <Card style={{ ...styles.metricCard, ...(tone === 'red' ? styles.metricCardRed : {}) }}>
    <View style={styles.metricHeading}>
      <AppText variant="small" numberOfLines={1} style={styles.metricTitle}>{title}</AppText>
      <View style={[styles.metricIcon, tone === 'red' && styles.metricIconRed]}>{icon}</View>
    </View>
    <AppText variant="amount" numberOfLines={1} style={[styles.metricValue, tone === 'red' && styles.metricValueRed]}>{value}</AppText>
    <AppText variant="small" color={tone === 'red' ? '#EF4444' : '#16865D'} numberOfLines={1} style={styles.metricDetail}>{detail}</AppText>
  </Card>;

  if (onPress) return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.metricWrap, pressed && styles.pressed]}>{card}</Pressable>;
  return <View style={styles.metricWrap}>{card}</View>;
}

function QuickAction({ title, icon, tone, onPress }: { title: string; icon: React.ReactNode; tone: 'sale' | 'stock' | 'customers'; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickAction, styles[tone], pressed && styles.pressed]}>
    {icon}
    <AppText variant="small" color={tone === 'sale' ? '#FFFFFF' : tone === 'customers' ? '#155EEF' : '#202033'} style={styles.quickLabel}>{title}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 12, paddingTop: 10, gap: 11, paddingBottom: 26 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricWrap: { width: '48%', flexGrow: 1, minWidth: '46%' },
  metricCard: { height: 76, paddingHorizontal: 9, paddingVertical: 8, gap: 3, borderRadius: 13, borderColor: '#DFEAFE', backgroundColor: '#FFFFFF', shadowColor: '#143B70', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  metricCardRed: { borderColor: '#FCE0E0' },
  metricHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  metricTitle: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 9.5, color: '#4C5B72' },
  metricIcon: { width: 23, height: 23, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF5FF' },
  metricIconRed: { backgroundColor: '#FFF0F0' },
  metricValue: { fontSize: 17, lineHeight: 19, color: '#182439' },
  metricValueRed: { color: '#E53935' },
  metricDetail: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter-Medium' },
  stockAlert: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FFF3E9' },
  stockAlertClear: { backgroundColor: '#ECF8F1' },
  alertIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  alertIconClear: { backgroundColor: '#DCF2E5', borderRadius: 8 },
  alertCopy: { flex: 1, gap: 1 },
  sectionTitle: { fontSize: 14, color: '#174EA6', marginTop: 1 },
  actions: { flexDirection: 'row', gap: 7 },
  quickAction: { flex: 1, minWidth: 0, height: 62, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12 },
  sale: { backgroundColor: '#1455D9' },
  stock: { backgroundColor: '#FFD844' },
  customers: { backgroundColor: '#E2EEFF' },
  quickLabel: { fontFamily: 'Inter-SemiBold', fontSize: 10 },
  pressed: { opacity: 0.84 },
});
