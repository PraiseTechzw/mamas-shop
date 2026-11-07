import { useCallback, useState, type ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cubicBezier,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  ArrowDown,
  ArrowUp,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  CircleCheck,
  CircleUserRound,
  Clock,
  CreditCard,
  HandCoins,
  History,
  Minus,
  PackagePlus,
  RefreshCcw,
  ShoppingCart,
  TriangleAlert,
  UsersRound,
  WalletCards,
} from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { formatMoney } from '@/lib/format';
import { getDashboardData, type DashboardData } from '@/db/repositories/dashboard';
import { getShopSettings, needsShopSetup } from '@/db/repositories/settings';
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
  grossProfitTodayCents: 0,
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
  if (yesterday === 0) return { label: 'No sales yesterday', positive: true };
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return { label: 'Same as yesterday', positive: null };
  return { label: `${pct > 0 ? '+' : ''}${pct}% vs yesterday`, positive: pct > 0 };
}

const pressEaseOut = cubicBezier(0.23, 1, 0.32, 1);
const refreshEaseOut = Easing.bezier(0.23, 1, 0.32, 1);

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
  const reduceMotion = useReducedMotion();
  const contentOpacity = useSharedValue(1);
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.get(),
  }));

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
      const [dashboard, settings] = await Promise.all([
        getDashboardData(db, ownerId),
        getShopSettings(db, ownerId),
      ]);
      const fresh = {
        ...dashboard,
        lowStockCount: settings.low_stock_alerts ? dashboard.lowStockCount : 0,
      };
      if (!reduceMotion) {
        contentOpacity.set(
          withSequence(
            withTiming(0.88, {
              duration: 90,
              easing: refreshEaseOut,
              reduceMotion: ReduceMotion.System,
            }),
            withTiming(1, {
              duration: 160,
              easing: refreshEaseOut,
              reduceMotion: ReduceMotion.System,
            }),
          ),
        );
      }
      setData(fresh);
    } finally {
      setRefreshing(false);
    }
  }, [db, businessId, session, reduceMotion, contentOpacity]);

  // Reload after synced or local writes while this tab is focused.
  useFocusEffect(useCallback(() => {
    void revision;
    void load();
  }, [load, revision]));

  const diff = salesDiff(data.salesTodayCents, data.salesYesterdayCents);
  const progressPct =
    data.salesYesterdayCents > 0
      ? Math.min(100, Math.round((data.salesTodayCents / data.salesYesterdayCents) * 100))
      : 0;
  const trendLabel =
    data.salesYesterdayCents === 0
      ? data.salesTodayCents === 0
        ? 'No sales yet'
        : 'No sales yesterday'
      : data.salesTodayCents > data.salesYesterdayCents
        ? 'Ahead of yesterday'
        : data.salesTodayCents < data.salesYesterdayCents
          ? 'Below yesterday'
          : 'Same as yesterday';
  const TrendIcon = diff.positive === true ? ArrowUp : diff.positive === false ? ArrowDown : Minus;
  const trendColor =
    diff.positive === false ? colors.dangerTint : diff.positive === true ? colors.gold : colors.surface;
  const trendBackground =
    diff.positive === false ? 'bg-danger/20' : diff.positive === true ? 'bg-gold/20' : 'bg-white/15';

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.purple} />
      }
    >
      <Animated.View style={contentAnimatedStyle} className="gap-4 px-4 pb-10 pt-3">

        {/* ── Header ── */}
        <View className="flex-row items-center gap-3 pt-1">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand">
            <CircleUserRound size={23} color={colors.surface} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText variant="heading" color={colors.text} style={{ fontSize: 16 }} numberOfLines={1}>
              {greeting}, {firstName}!
            </AppText>
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 12 }}>{dayLabel}</AppText>
          </View>
          {/* Online / Offline pill */}
          <View className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${online ? 'bg-success/10' : 'bg-warning/10'}`}>
            <View className={`h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-warning'}`} />
            <AppText variant="small" color={online ? colors.success : colors.warning} style={{ fontSize: 11 }}>
              {online ? 'Online' : 'Offline'}
            </AppText>
          </View>
        </View>

        {/* ── Hero Revenue Card ── */}
        <PressableCard
          accessibilityLabel="Open today's sales summary"
          onPress={() => router.push("/sales/daily-summary")}
          className="w-full"
        >
          {() => (
          <View className="relative overflow-hidden rounded-3xl bg-brand-deep px-5 pb-5 pt-5 shadow-lg shadow-brand-deep">
          {/* Quiet concentric brand motif, kept behind the card content. */}
          <View pointerEvents="none" className="absolute -right-10 -top-14 h-48 w-48 rounded-full border-8 border-white/5" />
          <View pointerEvents="none" className="absolute right-2 top-5 h-28 w-28 rounded-full border-2 border-gold/20" />
          <View pointerEvents="none" className="absolute right-11 top-14 h-12 w-12 rounded-full bg-gold/10" />
          <View pointerEvents="none" className="absolute right-8 top-10 h-2 w-2 rounded-full bg-gold/70" />
          {/* Top row */}
          <View className="mb-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <ChartNoAxesColumnIncreasing size={15} color={colors.gold} />
              <AppText variant="small" color={colors.surface} style={{ fontSize: 11, letterSpacing: 1 }}>
                {`TODAY'S SALES`}
              </AppText>
            </View>
            <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${trendBackground}`}>
              <TrendIcon size={11} color={trendColor} />
              <AppText variant="small" color={trendColor} style={{ fontSize: 10 }}>
                {trendLabel}
              </AppText>
            </View>
          </View>

          {/* Big number */}
          <HeroAmount cents={data.salesTodayCents} />

          {/* Progress bar */}
          <View className="mb-1 mt-3 gap-2">
            <View className="relative h-2 overflow-hidden rounded-full bg-white/15">
              <Animated.View
                className="absolute left-0 top-0 h-full rounded-full bg-gold"
                style={{
                  width: `${progressPct}%`,
                  transitionProperty: 'width',
                  transitionDuration: reduceMotion ? 0 : 220,
                  transitionTimingFunction: pressEaseOut,
                }}
              />
            </View>
            <View className="flex-row items-center justify-between">
              <DiffChip label={diff.label} positive={diff.positive} />
              {data.salesYesterdayCents > 0 ? (
                <AppText variant="small" color={colors.lavender} style={{ fontSize: 11 }}>
                  Previous day · {formatMoney(data.salesYesterdayCents)}
                </AppText>
              ) : null}
            </View>
          </View>

          {/* Divider */}
          <View className="my-3 h-px bg-white/15" />

          {/* Footer */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-baseline gap-1.5">
              <AppText
                variant="amount"
                color={colors.surface}
                style={{ fontSize: 23, lineHeight: 28, fontVariant: ['tabular-nums'] }}
              >
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
          )}
        </PressableCard>

        {/* ── Quick Actions ── */}
        <View className="gap-2">
          <AppText variant="heading" color={colors.text} style={{ fontSize: 14 }}>
            Quick actions
          </AppText>
          <View className="flex-row gap-2">
            <QuickAction
              title="New sale"
              icon={<ShoppingCart size={20} color={colors.surface} />}
              tone="primary"
              onPress={() => { useCart.getState().clear(); router.push('/(tabs)/sales'); }}
            />
            <QuickAction
              title="Add stock"
              icon={<PackagePlus size={20} color={colors.deepPurple} />}
              tone="gold"
              onPress={() => router.push('/inventory/receive-stock')}
            />
            <QuickAction
              title="Customers"
              icon={<UsersRound size={20} color={colors.deepPurple} />}
              tone="soft"
              onPress={() => router.push('/(tabs)/credit')}
            />
            <QuickAction
              title="History"
              icon={<History size={20} color={colors.deepPurple} />}
              tone="outline"
              onPress={() => router.push('/sales/history')}
            />
          </View>
        </View>

        {/* ── Today's Breakdown ── */}
        <View className="gap-2.5">
          <AppText variant="heading" color={colors.text} style={{ fontSize: 14 }}>
            Today at a glance
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
              onPress={() => router.push('/sales/change-owed')}
            />
          </View>
        </View>

        <View className="flex-row gap-2.5">
          <MetricCard
            title="Estimated Gross Profit"
            value={formatMoney(data.grossProfitTodayCents)}
            detail="Estimate · before expenses and tax"
            icon={<ChartNoAxesColumnIncreasing size={16} color={colors.deepPurple} />}
            iconBg="bg-gold/20"
          />
        </View>

        {/* ── Alerts ── */}
        <View className="gap-2.5">
          <AppText variant="heading" color={colors.text} style={{ fontSize: 14 }}>
            Stock alert
          </AppText>
          <StockAlertRow count={data.lowStockCount} />
        </View>

      </Animated.View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — all className-first
// ─────────────────────────────────────────────────────────────────────────────

function HeroAmount({ cents }: { cents: number }) {
  return (
    <AppText variant="amount" color={colors.surface} style={{ fontSize: 40, lineHeight: 46, letterSpacing: -1, fontVariant: ['tabular-nums'] }}>
      {formatMoney(cents)}
    </AppText>
  );
}

function PressableCard({
  accessibilityLabel,
  className,
  onPress,
  children,
}: {
  accessibilityLabel: string;
  className: string;
  onPress: () => void;
  children: (pressed: boolean) => ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={className}
    >
      {({ pressed }) => (
        <Animated.View
          style={{
            alignSelf: 'stretch',
            transform: [{ scale: pressed && !reduceMotion ? 0.985 : 1 }],
            transitionProperty: 'transform',
            transitionDuration: 120,
            transitionTimingFunction: pressEaseOut,
          }}
        >
          {children(pressed)}
        </Animated.View>
      )}
    </Pressable>
  );
}

function DiffChip({ label, positive }: { label: string; positive: boolean | null }) {
  const bg = positive === true ? 'bg-gold/20' : positive === false ? 'bg-danger/20' : 'bg-white/15';
  const textColor = positive === true ? colors.gold : positive === false ? colors.dangerTint : colors.surface;
  const Icon = positive === true ? ArrowUp : positive === false ? ArrowDown : Minus;

  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${bg}`}>
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
      className={`relative min-h-[112px] flex-1 gap-1.5 overflow-hidden rounded-2xl border border-line bg-surface px-3.5 py-3.5 shadow-sm ${pressed ? 'bg-brand-tint/40' : ''}`}
    >
      <View pointerEvents="none" className="absolute -bottom-7 -right-5 h-16 w-16 rounded-full border-8 border-brand-tint/60" />
      <View pointerEvents="none" className="absolute bottom-3 right-3 h-1.5 w-1.5 rounded-full bg-gold/70" />
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
        style={{ fontSize: 18, lineHeight: 23, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </AppText>
      {/* Title */}
      <AppText variant="small" color={colors.secondary} style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={2}>
        {title}
      </AppText>
      {/* Detail */}
      <AppText
        variant="small"
        color={valueDanger ? colors.danger : colors.secondary}
        style={{ fontSize: 11, lineHeight: 15 }}
        numberOfLines={1}
      >
        {detail}
      </AppText>
    </View>
  );

  if (onPress) {
    return (
      <PressableCard
        accessibilityLabel={`${title}: ${value}. ${detail}`}
        onPress={onPress}
        className="min-w-0 flex-1"
      >
        {(pressed) => inner(pressed)}
      </PressableCard>
    );
  }
  return <View className="min-w-0 flex-1">{inner()}</View>;
}

function StockAlertRow({ count }: { count: number }) {
  const ok = count === 0;
  return (
    <PressableCard
      accessibilityLabel={ok ? 'Stock looks good. Open inventory' : `${count} low stock items. Open inventory`}
      onPress={() => router.push('/(tabs)/inventory')}
      className="w-full"
    >
      {(pressed) => (
      <View className={`flex-row items-center gap-3 overflow-hidden rounded-2xl border bg-surface shadow-sm ${pressed ? 'bg-brand-tint/30' : ''} ${ok ? 'border-success/20' : 'border-warning/30'}`}>
      {/* Coloured left stripe */}
      <View className={`w-1 self-stretch ${ok ? 'bg-success' : 'bg-warning'}`} />

      {/* Icon */}
      <View className={`h-10 w-10 items-center justify-center rounded-xl ${ok ? 'bg-success/10' : 'bg-warning/10'}`}>
        {ok
          ? <CircleCheck size={18} color={colors.success} />
          : <TriangleAlert size={18} color={colors.warning} />}
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
      </View>
      )}
    </PressableCard>
  );
}

function QuickAction({
  title, icon, tone, onPress,
}: {
  title: string;
  icon: ReactNode;
  tone: 'primary' | 'gold' | 'soft' | 'outline';
  onPress: () => void;
}) {
  const foreground = tone === 'primary' ? colors.surface : colors.deepPurple;
  const iconBackground = tone === 'primary'
    ? 'bg-brand'
    : tone === 'gold'
      ? 'bg-gold/25'
      : tone === 'soft'
        ? 'bg-brand-tint'
        : 'bg-surface';

  return (
    <PressableCard
      accessibilityLabel={title}
      onPress={onPress}
      className="min-w-0 flex-1"
    >
      {(pressed) => (
        <View className={`min-h-[72px] flex-1 items-center justify-center gap-2 rounded-xl px-1 py-1 ${pressed ? 'bg-brand-tint/60' : ''}`}>
          <View className={`h-11 w-11 items-center justify-center rounded-full ${iconBackground}`}>
            {icon}
          </View>
          <AppText
            variant="label"
            color={foreground}
            style={{ fontSize: 11, textAlign: 'center' }}
            numberOfLines={1}
          >
            {title}
          </AppText>
        </View>
      )}
    </PressableCard>
  );
}
