import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Banknote, Bell, CircleAlert, CreditCard } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { formatMoney } from '@/lib/format';
import { getDashboardData, type DashboardData } from '@/db/repositories/dashboard';
import { useAuth } from '@/features/auth/auth-context';
import { AppText, Card, SectionTitle } from '@/components/ui/primitives';

const emptyData: DashboardData = { salesTodayCents: 0, salesTodayCount: 0, paymentsTodayCents: 0, creditOutstandingCents: 0, lowStockCount: 0, salesBySeller: [], salesByLocation: [] };
const sellerColors = ['#4D35D7', '#F5A623', '#23A47A', '#E94E64', '#4388E8'];

export function DashboardScreen() {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const [data, setData] = useState(emptyData);
  const [refreshing, setRefreshing] = useState(false);
  const [breakdown, setBreakdown] = useState<'location' | 'seller'>('location');
  const firstName = String(session?.user.user_metadata?.full_name ?? session?.user.email?.split('@')[0] ?? 'Mama').split(' ')[0];
  const load = useCallback(async () => { setRefreshing(true); try { setData(await getDashboardData(db, session?.user.id ?? '')); } finally { setRefreshing(false); } }, [db, session?.user.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh dashboard totals from local SQLite on screen entry.
  useEffect(() => { void load(); }, [load]);
  return <ScrollView className="flex-1 bg-canvas" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.purple} />} contentContainerStyle={styles.page}>
    <View style={styles.profileRow}>
      <View style={styles.profileAvatar}><AppText variant="label" color={colors.deepPurple}>{firstName.slice(0, 1).toUpperCase()}</AppText></View>
      <View style={styles.profileText}><AppText variant="label">{firstName}</AppText><AppText variant="small" color={colors.secondary}>Owner</AppText></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Notification settings" onPress={() => router.push('/settings/notifications')} style={styles.bellButton}><Bell size={20} stroke={colors.deepPurple} /></Pressable>
    </View>
    <View style={styles.greeting}>
      <AppText variant="heading" style={styles.greetingTitle}>Good morning, {firstName}!</AppText>
      <AppText color={colors.secondary}>Here’s what’s happening with your shop today.</AppText>
    </View>

    <View style={styles.metrics}>
      <MetricCard title="Today’s Sales" value={formatMoney(data.salesTodayCents)} caption={`${data.salesTodayCount} ${data.salesTodayCount === 1 ? 'sale' : 'sales'} today`} icon={<Banknote size={17} stroke="#1A9A70" />} tone="green" />
      <MetricCard title="Cash Received" value={formatMoney(data.paymentsTodayCents)} caption="Payments recorded today" icon={<Banknote size={17} stroke="#338A72" />} tone="mint" />
      <MetricCard title="Credit Owed" value={formatMoney(data.creditOutstandingCents)} caption="Outstanding customer credit" icon={<CreditCard size={17} stroke="#EC5366" />} tone="rose" />
      <MetricCard title="Low Stock" value={`${data.lowStockCount} items`} caption={data.lowStockCount ? 'Restock needed' : 'Stock levels look good'} icon={<CircleAlert size={17} stroke="#ED8B22" />} tone="orange" />
    </View>

    <View style={styles.breakdownHeading}><SectionTitle>Sales Breakdown</SectionTitle></View>
    <Card style={styles.breakdownCard}>
      <View style={styles.segmented}>
        <Pressable onPress={() => setBreakdown('location')} style={[styles.segment, breakdown === 'location' && styles.segmentActive]}><AppText variant="small" color={breakdown === 'location' ? colors.deepPurple : colors.secondary}>By Location</AppText></Pressable>
        <Pressable onPress={() => setBreakdown('seller')} style={[styles.segment, breakdown === 'seller' && styles.segmentActive]}><AppText variant="small" color={breakdown === 'seller' ? colors.deepPurple : colors.secondary}>By Seller</AppText></Pressable>
      </View>
      {breakdown === 'seller' && data.salesBySeller.length > 0 ? <SellerBreakdown rows={data.salesBySeller} /> : breakdown === 'location' && data.salesByLocation.length > 0 ? <LocationBreakdown rows={data.salesByLocation} /> : <View style={styles.breakdownEmpty}>
        <Image source={require('@/assets/images/shop-illustrations/reports/analytics-unavailable.png')} resizeMode="contain" style={styles.emptyIllustration} accessibilityLabel="Sales breakdown illustration" />
        <AppText variant="label" style={styles.emptyTitle}>{breakdown === 'location' ? 'No location breakdown yet' : 'No seller sales yet'}</AppText>
        <AppText variant="small" color={colors.secondary} style={styles.emptyHint}>{breakdown === 'location' ? 'Choose a location on each sale to compare shop totals.' : 'Add seller profiles, then select a seller on each sale.'}</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push(breakdown === 'location' ? '/settings/locations' : '/settings/team')} style={styles.breakdownSetup}><AppText variant="small" color={colors.deepPurple}>{breakdown === 'location' ? 'Manage locations' : 'Manage sellers'}</AppText><Banknote size={14} stroke={colors.deepPurple}/></Pressable>
      </View>}
    </Card>
  </ScrollView>;
}

function MetricCard({ title, value, caption, icon, tone }: { title: string; value: string; caption: string; icon: React.ReactNode; tone: 'green' | 'mint' | 'rose' | 'orange' }) {
  return <Card style={{ ...styles.metricCard, backgroundColor: metricTones[tone].surface, borderColor: metricTones[tone].border }}>
    <View style={styles.metricTitleRow}><View style={[styles.metricIcon, { backgroundColor: metricTones[tone].icon }]}>{icon}</View><AppText variant="small" color={colors.text} numberOfLines={1} style={styles.metricTitle}>{title}</AppText></View>
    <AppText variant="amount" numberOfLines={1} style={styles.metricValue}>{value}</AppText>
    <AppText variant="small" color={metricTones[tone].accent} numberOfLines={1} style={styles.metricCaption}>{caption}</AppText>
  </Card>;
}

function SellerBreakdown({ rows }: { rows: DashboardData['salesBySeller'] }) {
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0);
  const circumference = 2 * Math.PI * 55;
  let offset = 0;
  return <View style={styles.sellerBreakdown}>
    <View style={styles.donutWrap}>
      <Svg width={148} height={148} viewBox="0 0 148 148">
        <Circle cx={74} cy={74} r={55} fill="none" stroke="#EDEBFA" strokeWidth={18} />
        {total > 0 ? rows.map((row, index) => {
          const length = (row.totalCents / total) * circumference;
          const currentOffset = offset;
          offset += length;
          return <Circle key={row.sellerId ?? 'unassigned'} cx={74} cy={74} r={55} fill="none" stroke={sellerColors[index % sellerColors.length]} strokeWidth={18} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-currentOffset} transform="rotate(-90 74 74)" />;
        }) : null}
      </Svg>
      <View style={styles.donutCenter}><AppText variant="small" color={colors.secondary}>Sales</AppText><AppText variant="label">{rows.reduce((sum, row) => sum + row.saleCount, 0)}</AppText></View>
    </View>
    <View style={styles.sellerLegend}>{rows.map((row, index) => <View key={row.sellerId ?? 'unassigned'} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: sellerColors[index % sellerColors.length] }]} /><AppText variant="small" style={styles.legendName} numberOfLines={1}>{row.sellerName}</AppText><AppText variant="small" color={colors.secondary}>{total ? Math.round((row.totalCents / total) * 100) : 0}%</AppText><AppText variant="small" style={styles.legendAmount}>{formatMoney(row.totalCents)}</AppText></View>)}</View>
  </View>;
}

function LocationBreakdown({ rows }: { rows: DashboardData['salesByLocation'] }) {
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0);
  return <View style={styles.locationBreakdown}>{rows.map((row,index)=><View key={row.locationId??'unassigned'} style={styles.locationBarRow}><View style={styles.locationBarHeading}><View style={[styles.legendDot,{backgroundColor:sellerColors[index%sellerColors.length]}]}/><AppText variant="small" style={styles.legendName}>{row.locationName}</AppText><AppText variant="small" color={colors.secondary}>{row.saleCount} sales</AppText><AppText variant="small" style={styles.legendAmount}>{formatMoney(row.totalCents)}</AppText></View><View style={styles.barTrack}><View style={[styles.barFill,{width:`${total?Math.max(4,row.totalCents/total*100):0}%`,backgroundColor:sellerColors[index%sellerColors.length]}]}/></View></View>)}</View>;
}

const metricTones = {
  green: { surface: '#F0FBF7', border: '#DFF5EC', icon: '#DCF5EB', accent: '#18865F' },
  mint: { surface: '#F0FAF8', border: '#E0F3EF', icon: '#DDF3ED', accent: '#20896F' },
  rose: { surface: '#FFF4F5', border: '#FBE7EA', icon: '#FFE2E6', accent: '#D64C5E' },
  orange: { surface: '#FFF8EE', border: '#F9EEDB', icon: '#FFEBD1', accent: '#D77B1B' },
};

const styles = StyleSheet.create({
  page: { padding: 18, paddingTop: 14, paddingBottom: 30, gap: 15 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  profileAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F6D9BC', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  profileText: { flex: 1, gap: 1 },
  bellButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  greeting: { gap: 3, marginTop: 1, marginBottom: 2 },
  greetingTitle: { fontSize: 21, color: colors.text },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { width: '48%', flexGrow: 1, minWidth: '45%', padding: 12, gap: 7, borderRadius: 17 },
  metricTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metricIcon: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  metricTitle: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 11 },
  metricValue: { fontSize: 19, lineHeight: 23 },
  metricCaption: { fontSize: 9, lineHeight: 12 },
  breakdownHeading: { marginTop: 1, marginBottom: -6 },
  breakdownCard: { padding: 12, gap: 11, borderRadius: 18 },
  segmented: { flexDirection: 'row', gap: 7 },
  segment: { flex: 1, minHeight: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#F1F3F8' },
  segmentActive: { backgroundColor: '#EBE9FD' },
  breakdownEmpty: { minHeight: 205, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 15, backgroundColor: '#FAFAFE' },
  emptyIllustration: { width: 148, height: 112 },
  emptyTitle: { marginTop: 3, textAlign: 'center' },
  emptyHint: { textAlign: 'center', marginTop: 4, lineHeight: 16 },
  breakdownSetup: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.lavenderTint },
  sellerBreakdown: { minHeight: 200, flexDirection: 'row', alignItems: 'center', gap: 12 },
  donutWrap: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sellerLegend: { flex: 1, gap: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendName: { flex: 1 },
  legendAmount: { width: 59, textAlign: 'right' },
  locationBreakdown: { minHeight: 190, justifyContent: 'center', gap: 17, paddingVertical: 14 },
  locationBarRow: { gap: 7 },
  locationBarHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barTrack: { height: 8, overflow: 'hidden', borderRadius: 5, backgroundColor: '#EDEBFA' },
  barFill: { height: '100%', borderRadius: 5 },
});
