import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  ArrowDown,
  ArrowUp,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  CircleUserRound,
  Clock,
  CreditCard,
  HandCoins,
  History,
  Minus,
  PackagePlus,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  TriangleAlert,
  UsersRound,
  WalletCards,
} from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { formatMoney } from '@/lib/format';
import { getDashboardData, type DashboardData } from '@/db/repositories/dashboard';
import { needsShopSetup } from '@/db/repositories/settings';
import { useAuth } from '@/features/auth/auth-context';
import { AppText } from '@/components/ui/primitives';
import { useSyncStatus } from '@/features/sync/sync-context';
import { useCart } from '@/stores/cart';

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

const emptyData: DashboardData = {
  salesTodayCents: 0,
  salesTodayCount: 0,
  salesYesterdayCents: 0,
  salesYesterdayCount: 0,
  cashReceivedTodayCents: 0,
  cashPaymentsTodayCount: 0,
  creditGivenTodayCents: 0,
  creditSalesTodayCount: 0,
  creditOutstandingCents: 0,
  owingCustomerCount: 0,
  changeOwedOpenCents: 0,
  lowStockCount: 0,
  lastSaleAt: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function getGreeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return 'Yesterday';
}

function formatDayDate(): string {
  return new Intl.DateTimeFormat('en-ZW', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

function salesDiff(
  today: number,
  yesterday: number,
): { label: string; positive: boolean | null } {
  if (yesterday === 0 && today === 0) return { label: 'No sales yet today', positive: null };
  if (yesterday === 0) return { label: 'First sales today!', positive: true };
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return { label: 'Same as yesterday', positive: null };
  return { label: `${pct > 0 ? '+' : ''}${pct}% vs yesterday`, positive: pct > 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Count-up hook
// ─────────────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900) {
  const [anim] = useState(() => new Animated.Value(0));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: target,
      duration,
      useNativeDriver: false,
    }).start();
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    return () => anim.removeListener(id);
  }, [target, duration, anim]);

  return display;
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const { revision, connection } = useSyncStatus();
  const online = connection === 'online';

  const [data, setData] = useState(emptyData);
  const [refreshing, setRefreshing] = useState(false);
  // Start at 1 so content is always visible — no black screen
  const [fadeAnim] = useState(() => new Animated.Value(1));

  const accountName = String(
    session?.user.user_metadata?.full_name ??
      session?.user.email?.split('@')[0] ??
      'Shop owner',
  ).trim();
  const firstName = accountName.split(/\s+/)[0] || 'Shop owner';
  const greeting = getGreeting(new Date().getHours());
  const dayLabel = formatDayDate();

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const ownerId = businessId ?? session?.user.id ?? '';
      if (
        session &&
        businessId === session.user.id &&
        (await needsShopSetup(db, ownerId))
      ) {
        router.replace('/setup');
        return;
      }
      const fresh = await getDashboardData(db, ownerId);
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.6, duration: 100, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      setData(fresh);
    } finally {
      setRefreshing(false);
    }
  }, [db, businessId, session, fadeAnim]);

  /* eslint-disable react-hooks/set-state-in-effect -- load() is async; setState runs after await */
  useEffect(() => { void load(); }, [load, revision]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const diff = salesDiff(data.salesTodayCents, data.salesYesterdayCents);
  const progressPct =
    data.salesYesterdayCents > 0
      ? Math.min(100, Math.round((data.salesTodayCents / data.salesYesterdayCents) * 100))
      : data.salesTodayCents > 0
        ? 100
        : 0;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.purple} />
      }
    >
      <Animated.View style={{ opacity: fadeAnim }} className="gap-4 px-4 pb-10 pt-3">

        {/* ── Header ── */}
        <View className="flex-row items-center gap-3 pt-1">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-tint">
            <CircleUserRound size={22} color={colors.deepPurple} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText variant="heading" color={colors.deepPurple} style={{ fontSize: 16 }} numberOfLines={1}>
              {greeting}, {firstName}!
            </AppText>
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>{dayLabel}</AppText>
          </View>
          {/* Online / Offline pill */}
          <View className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${online ? 'bg-success/10' : 'bg-warning/10'}`}>
            <View className={`h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-warning'}`} />
            <AppText variant="small" color={online ? colors.success : colors.warning} style={{ fontSize: 10 }}>
              {online ? 'Online' : 'Offline'}
            </AppText>
          </View>
        </View>

        {/* ── Hero Revenue Card ── */}
        <View
          className="rounded-3xl px-5 pb-4 pt-5"
          style={{
            backgroundColor: colors.deepPurple,
            shadowColor: '#1A0D6B',
            shadowOpacity: 0.45,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 12 },
            elevation: 14,
          }}
        >
          {/* Top row */}
          <View className="mb-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <ChartNoAxesColumnIncreasing size={13} color={colors.lavender} />
              <AppText variant="small" color={colors.lavender} style={{ fontSize: 10, letterSpacing: 1 }}>
                {`TODAY'S REVENUE`}
              </AppText>
            </View>
            <View
              className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
              style={{ backgroundColor: 'rgba(255,200,61,0.2)' }}
            >
              <Sparkles size={10} color={colors.gold} />
              <AppText variant="small" color={colors.gold} style={{ fontSize: 10 }}>Keep it up!</AppText>
            </View>
          </View>

          {/* Big number */}
          <HeroAmount cents={data.salesTodayCents} />

          {/* Progress bar */}
          <View className="mb-1 mt-3 gap-2">
            <View
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <View
                className="h-full rounded-full"
                style={{ width: `${progressPct}%`, backgroundColor: colors.gold }}
              />
            </View>
            <View className="flex-row items-center justify-between">
              <DiffChip label={diff.label} positive={diff.positive} />
              {data.salesYesterdayCents > 0 ? (
                <AppText variant="small" color={colors.lavender} style={{ fontSize: 10 }}>
                  Yesterday {formatMoney(data.salesYesterdayCents)}
                </AppText>
              ) : null}
            </View>
          </View>

          {/* Divider */}
          <View className="my-3" style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.18)' }} />

          {/* Footer */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-baseline gap-1.5">
              <AppText variant="amount" color={colors.surface} style={{ fontSize: 22, lineHeight: 26 }}>
                {data.salesTodayCount}
              </AppText>
              <AppText variant="small" color={colors.lavender} style={{ fontSize: 11 }}>
                {data.salesTodayCount === 1 ? 'sale today' : 'sales today'}
              </AppText>
            </View>
            {data.lastSaleAt ? (
              <View className="flex-row items-center gap-1.5">
                <Clock size={12} color={colors.lavender} />
                <AppText variant="small" color={colors.lavender} style={{ fontSize: 11 }}>
                  Last {formatRelativeTime(data.lastSaleAt)}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Today's Breakdown ── */}
        <View className="gap-2.5">
          <AppText variant="small" color={colors.secondary} style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
            Today&apos;s Breakdown
          </AppText>
          <View className="flex-row gap-2.5">
            <MetricCard
              title="Cash Received"
              value={formatMoney(data.cashReceivedTodayCents)}
              detail={`${data.cashPaymentsTodayCount} ${data.cashPaymentsTodayCount === 1 ? 'payment' : 'payments'}`}
              icon={<WalletCards size={16} color={colors.success} />}
              iconBg="bg-success/10"
            />
            <MetricCard
              title="Credit Given"
              value={formatMoney(data.creditGivenTodayCents)}
              detail={`${data.creditSalesTodayCount} credit ${data.creditSalesTodayCount === 1 ? 'sale' : 'sales'}`}
              icon={<HandCoins size={16} color={colors.purple} />}
              iconBg="bg-brand-tint"
            />
          </View>
          <View className="flex-row gap-2.5">
            <MetricCard
              title="Outstanding Credit"
              value={formatMoney(data.creditOutstandingCents)}
              detail={`${data.owingCustomerCount} ${data.owingCustomerCount === 1 ? 'customer owes' : 'customers owe'}`}
              icon={<CreditCard size={16} color={colors.danger} />}
              iconBg="bg-danger/10"
              valueDanger={data.creditOutstandingCents > 0}
              onPress={() => router.push('/(tabs)/credit')}
            />
            <MetricCard
              title="Change Owed"
              value={formatMoney(data.changeOwedOpenCents)}
              detail="to return to customers"
              icon={<RefreshCcw size={16} color={colors.warning} />}
              iconBg="bg-warning/10"
              valueDanger={data.changeOwedOpenCents > 0}
            />
          </View>
        </View>

        {/* ── Alerts ── */}
        <View className="gap-2.5">
          <AppText variant="small" color={colors.secondary} style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
            Alerts
          </AppText>
          <StockAlertRow count={data.lowStockCount} />
        </View>

        {/* ── Quick Actions ── */}
        <View className="gap-2.5">
          <AppText variant="small" color={colors.secondary} style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
            Quick Actions
          </AppText>
          <View className="flex-row gap-2.5">
            <QuickAction
              title="New Sale"
              icon={<ShoppingCart size={22} color="#fff" />}
              className="bg-info"
              textColor="#fff"
              onPress={() => { useCart.getState().clear(); router.push('/(tabs)/sales'); }}
            />
            <QuickAction
              title="Add Stock"
              icon={<PackagePlus size={22} color={colors.text} />}
              className="bg-gold"
              textColor={colors.text}
              onPress={() => router.push('/inventory/receive-stock')}
            />
          </View>
          <View className="flex-row gap-2.5">
            <QuickAction
              title="Customers"
              icon={<UsersRound size={22} color={colors.deepPurple} />}
              className="bg-brand-tint"
              textColor={colors.deepPurple}
              onPress={() => router.push('/(tabs)/credit')}
            />
            <QuickAction
              title="Sales History"
              icon={<History size={22} color={colors.deepPurple} />}
              className="bg-info/10"
              textColor={colors.deepPurple}
              onPress={() => router.push('/sales/history')}
            />
          </View>
        </View>

      </Animated.View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — all className-first
// ─────────────────────────────────────────────────────────────────────────────

function HeroAmount({ cents }: { cents: number }) {
  const displayed = useCountUp(cents);
  return (
    <AppText variant="amount" color={colors.surface} style={{ fontSize: 40, lineHeight: 46, letterSpacing: -1 }}>
      {formatMoney(displayed)}
    </AppText>
  );
}

function DiffChip({ label, positive }: { label: string; positive: boolean | null }) {
  const bg =
    positive === true ? 'rgba(22,134,93,0.28)' :
    positive === false ? 'rgba(220,53,69,0.28)' :
    'rgba(255,255,255,0.14)';
  const textColor =
    positive === true ? '#80FFCA' :
    positive === false ? '#FFAAAA' :
    colors.lavender;
  const Icon = positive === true ? ArrowUp : positive === false ? ArrowDown : Minus;

  return (
    <View className="flex-row items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: bg }}>
      <Icon size={10} color={textColor} />
      <AppText variant="small" color={textColor} style={{ fontSize: 10 }}>{label}</AppText>
    </View>
  );
}

function MetricCard({
  title, value, detail, icon, iconBg, valueDanger = false, onPress,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  /** NativeWind bg class e.g. "bg-success/10" */
  iconBg: string;
  valueDanger?: boolean;
  onPress?: () => void;
}) {
  const inner = (pressed = false) => (
    <View
      className={`min-h-[100px] flex-1 gap-1 rounded-2xl border border-line bg-surface px-3.5 py-3 ${pressed ? 'bg-brand-tint/40' : ''}`}
      style={{ shadowColor: '#202033', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}
    >
      {/* Icon + optional chevron */}
      <View className="mb-0.5 flex-row items-center justify-between">
        <View className={`h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </View>
        {onPress ? <ChevronRight size={14} color={colors.secondary} /> : null}
      </View>
      {/* Amount */}
      <AppText
        variant="amount"
        color={valueDanger ? colors.danger : colors.text}
        numberOfLines={1}
        style={{ fontSize: 19, lineHeight: 23 }}
      >
        {value}
      </AppText>
      {/* Title */}
      <AppText variant="small" color={colors.secondary} style={{ fontSize: 10 }} numberOfLines={1}>
        {title}
      </AppText>
      {/* Detail */}
      <AppText
        variant="small"
        color={valueDanger ? colors.danger : colors.secondary}
        style={{ fontSize: 10, lineHeight: 13 }}
        numberOfLines={1}
      >
        {detail}
      </AppText>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="min-w-0 flex-1"
      >
        {({ pressed }) => inner(pressed)}
      </Pressable>
    );
  }
  return <View className="min-w-0 flex-1">{inner()}</View>;
}

function StockAlertRow({ count }: { count: number }) {
  const ok = count === 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ok ? 'Stock looks good. Open inventory' : `${count} low stock items. Open inventory`}
      onPress={() => router.push('/(tabs)/inventory')}
      className={`flex-row items-center gap-3 overflow-hidden rounded-2xl border bg-surface active:opacity-80 ${ok ? 'border-success/20' : 'border-warning/30'}`}
      style={{ shadowColor: '#202033', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}
    >
      {/* Coloured left stripe */}
      <View
        className="w-1 self-stretch"
        style={{ backgroundColor: ok ? colors.success : colors.warning }}
      />

      {/* Icon */}
      <View className={`h-10 w-10 items-center justify-center rounded-xl ${ok ? 'bg-success/10' : 'bg-warning/10'}`}>
        <TriangleAlert size={18} color={ok ? colors.success : colors.warning} />
      </View>

      {/* Text */}
      <View className="min-w-0 flex-1 gap-0.5 py-3">
        <AppText variant="label" color={ok ? colors.success : colors.warning} style={{ fontSize: 13 }}>
          {ok ? 'Stock looks good' : 'Low Stock Alert'}
        </AppText>
        <AppText variant="small" color={colors.secondary} style={{ fontSize: 11, lineHeight: 16 }} numberOfLines={2}>
          {ok
            ? 'All products are above their minimum level'
            : `${count} ${count === 1 ? 'product is' : 'products are'} below reorder level`}
        </AppText>
      </View>

      {/* Count badge */}
      {count > 0 ? (
        <View className="items-center rounded-full bg-warning/10 px-2.5 py-1">
          <AppText variant="label" color={colors.warning} style={{ fontSize: 12 }}>{count}</AppText>
        </View>
      ) : null}

      <ChevronRight size={17} color={colors.secondary} />
      <View className="w-3" />
    </Pressable>
  );
}

function QuickAction({
  title, icon, className: cls, textColor, onPress,
}: {
  title: string;
  icon: ReactNode;
  /** NativeWind bg class e.g. "bg-info" */
  className: string;
  textColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`h-20 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl active:opacity-75 ${cls}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
        {icon}
      </View>
      <AppText variant="label" color={textColor} style={{ fontSize: 12 }}>
        {title}
      </AppText>
    </Pressable>
  );
}
