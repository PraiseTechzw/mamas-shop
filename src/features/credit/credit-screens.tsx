import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Pencil,
  Phone,
  Plus,
  Search,
  Smartphone,
  User,
  WalletCards,
} from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { formatDate, formatMoney, toCents } from '@/lib/format';
import {
  createCustomer,
  getCustomer,
  listCustomerPurchaseItems,
  listCustomerRepayments,
  listCustomers,
  updateCustomer,
} from '@/db/repositories/customers';
import { recordRepayment } from '@/db/repositories/sales';
import type { Customer, CustomerPurchaseItem, CustomerRepayment, PaymentMethod } from '@/db/schema';
import { useCart } from '@/stores/cart';
import { useAuth } from '@/features/auth/auth-context';
import {
  AppText,
  Field,
  Page,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import { IllustratedEmptyState } from '@/components/feedback/illustrated-empty-state';
import { useSyncStatus } from '@/features/sync/sync-context';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function avatarBg(name: string) {
  const hues = ['bg-brand', 'bg-info', 'bg-success', 'bg-warning', 'bg-gold'];
  const idx = name.charCodeAt(0) % hues.length;
  return hues[idx] ?? 'bg-brand';
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export function CreditCustomersScreen() { return <CustomerList />; }
export function CreditSaleCustomerPicker() { return <CustomerList selectForCreditSale />; }

// ─────────────────────────────────────────────────────────────────────────────
// CustomerList
// ─────────────────────────────────────────────────────────────────────────────

function CustomerList({ selectForCreditSale = false }: { selectForCreditSale?: boolean }) {
  const params = useLocalSearchParams<{ preserveCart?: string; purpose?: string }>();
  const preserveCart = params.preserveCart === 'true';
  const selectingChangeCustomer = params.purpose === 'change';

  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const { revision } = useSyncStatus();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => setCustomers(await listCustomers(db, ownerId));

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [db, ownerId, revision]);

  const save = async () => {
    setError('');
    if (!name.trim()) { setError("Enter the customer's name to continue."); return; }
    setSaving(true);
    try {
      await createCustomer(db, ownerId, name, phone);
      setName(''); setPhone(''); setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this customer.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = customers.filter(
    (c) =>
      (!balanceOnly || c.balance_cents > 0) &&
      `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  const choose = (customer: Customer) => {
    if (selectForCreditSale) {
      if (!preserveCart) useCart.getState().clear();
      if (selectingChangeCustomer) {
        useCart.getState().setCreditCustomer(customer.id);
        router.back();
      } else {
        useCart.getState().setCreditMode(true, customer.id);
        if (preserveCart) router.back();
        else router.push('/(tabs)/sales');
      }
    } else {
      router.push({ pathname: '/credit/[customerId]', params: { customerId: customer.id } });
    }
  };

  const totalOwed = customers.reduce((s, c) => s + c.balance_cents, 0);
  const owingCount = customers.filter((c) => c.balance_cents > 0).length;

  const pageTitle = selectForCreditSale
    ? selectingChangeCustomer ? 'Change collection' : 'Choose a customer'
    : 'Customers';
  const pageSubtitle = selectForCreditSale
    ? selectingChangeCustomer
      ? 'Choose who will collect the change from this sale.'
      : 'Select who will receive this sale on account.'
    : 'Track balances and repayments.';

  return (
    <Page
      title={pageTitle}
      subtitle={pageSubtitle}
      back={selectForCreditSale}
      right={
        !selectForCreditSale ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add customer"
            onPress={() => setAdding((v) => !v)}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-xl bg-brand active:opacity-80"
          >
            <Plus size={20} color={colors.surface} />
          </Pressable>
        ) : null
      }
    >
      {/* ── Summary bar (main list only) ── */}
      {!selectForCreditSale ? (
        <View className="flex-row gap-2.5">
          <View className="min-w-0 flex-1 gap-1 rounded-2xl border border-line bg-surface px-4 py-3"
            style={{ shadowColor: '#202033', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Total owed
            </AppText>
            <AppText variant="amount" color={totalOwed > 0 ? colors.danger : colors.text} style={{ fontSize: 22 }}>
              {formatMoney(totalOwed)}
            </AppText>
          </View>
          <View className="min-w-0 flex-1 gap-1 rounded-2xl border border-line bg-surface px-4 py-3"
            style={{ shadowColor: '#202033', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Owing customers
            </AppText>
            <AppText variant="amount" color={owingCount > 0 ? colors.warning : colors.text} style={{ fontSize: 22 }}>
              {owingCount}
            </AppText>
          </View>
        </View>
      ) : null}

      {/* ── Add customer form ── */}
      {adding ? (
        <View className="gap-3 rounded-2xl border border-brand/30 bg-brand-tint px-4 py-4">
          <View className="flex-row items-center gap-2.5">
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-brand">
              <Plus size={16} color={colors.surface} />
            </View>
            <AppText variant="heading" style={{ fontSize: 15 }}>New customer</AppText>
          </View>
          <Field
            label="Customer name"
            placeholder="e.g. Tinashe Moyo"
            value={name}
            onChangeText={(v) => { setName(v); if (error) setError(''); }}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <Field
            label="Phone number (optional)"
            placeholder="+263 77 123 4567"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            returnKeyType="done"
          />
          {error ? (
            <View className="rounded-xl bg-danger/10 px-3 py-2">
              <AppText variant="small" color={colors.danger}>{error}</AppText>
            </View>
          ) : null}
          <View className="flex-row gap-2.5">
            <Pressable
              accessibilityRole="button"
              onPress={() => void save()}
              className={`min-h-[46px] flex-1 items-center justify-center rounded-xl ${saving ? 'bg-brand/60' : 'bg-brand'} active:opacity-80`}
            >
              <AppText variant="label" color={colors.surface}>{saving ? 'Saving…' : 'Save customer'}</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setAdding(false); setError(''); }}
              className="min-h-[46px] flex-1 items-center justify-center rounded-xl border border-line bg-surface active:opacity-80"
            >
              <AppText variant="label" color={colors.deepPurple}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── Search + filter ── */}
      <Field
        label=""
        accessibilityLabel="Search customers"
        placeholder="Search customers…"
        value={search}
        onChangeText={setSearch}
        icon={<Search size={18} color={colors.secondary} />}
      />

      {!selectForCreditSale ? (
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setBalanceOnly(false)}
            className={`min-h-9 flex-1 items-center justify-center rounded-full border px-3 active:opacity-80 ${!balanceOnly ? 'border-brand bg-brand' : 'border-line bg-surface'}`}
          >
            <AppText variant="small" color={!balanceOnly ? colors.surface : colors.secondary} style={{ fontSize: 12 }}>
              All ({customers.length})
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => setBalanceOnly(true)}
            className={`min-h-9 flex-1 items-center justify-center rounded-full border px-3 active:opacity-80 ${balanceOnly ? 'border-brand bg-brand' : 'border-line bg-surface'}`}
          >
            <AppText variant="small" color={balanceOnly ? colors.surface : colors.secondary} style={{ fontSize: 12 }}>
              With Balance ({owingCount})
            </AppText>
          </Pressable>
        </View>
      ) : null}

      {/* ── Customer list ── */}
      {filtered.length ? (
        <View className="overflow-hidden rounded-2xl border border-line bg-surface"
          style={{ shadowColor: '#202033', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}
        >
          {filtered.map((customer, idx) => {
            const isLast = idx === filtered.length - 1;
            return (
              <Pressable
                key={customer.id}
                accessibilityRole="button"
                accessibilityLabel={`${customer.name}, balance ${formatMoney(customer.balance_cents)}`}
                onPress={() => choose(customer)}
                className={`flex-row items-center gap-3 px-4 py-3 active:bg-brand-tint/50 ${isLast ? '' : 'border-b border-line'}`}
              >
                {/* Avatar */}
                <View className={`h-11 w-11 items-center justify-center rounded-full ${avatarBg(customer.name)}`}>
                  <AppText variant="label" color={colors.surface} style={{ fontSize: 13 }}>
                    {initials(customer.name)}
                  </AppText>
                </View>

                {/* Name + phone */}
                <View className="min-w-0 flex-1 gap-0.5">
                  <AppText variant="label" numberOfLines={1} style={{ fontSize: 14 }}>{customer.name}</AppText>
                  <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }} numberOfLines={1}>
                    {customer.phone || 'No phone number'}
                  </AppText>
                </View>

                {/* Balance */}
                <View className="items-end gap-0.5">
                  <AppText
                    variant="label"
                    color={customer.balance_cents > 0 ? colors.danger : colors.success}
                    style={{ fontSize: 13 }}
                  >
                    {formatMoney(customer.balance_cents)}
                  </AppText>
                  <AppText variant="small" color={colors.secondary} style={{ fontSize: 10 }}>
                    {customer.balance_cents > 0 ? 'Owed' : 'Clear'}
                  </AppText>
                </View>

                <ChevronRight size={16} color={colors.secondary} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <IllustratedEmptyState
          image={require('@/assets/images/shop-illustrations/credit/customer-credit.png')}
          title={search ? 'No matching customers' : 'No customers yet'}
          description={
            selectForCreditSale
              ? 'Add a customer first, then return here to start their credit sale.'
              : 'Save customers here to keep their credit sales and payments together.'
          }
          action={
            <PrimaryButton
              label={search ? 'Clear search' : 'Add your first customer'}
              onPress={() => (search ? setSearch('') : setAdding(true))}
            />
          }
        />
      )}
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomerAccountScreen
// ─────────────────────────────────────────────────────────────────────────────

export function CustomerAccountScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const { revision } = useSyncStatus();
  const params = useLocalSearchParams<{ customerId: string }>();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;

  const [customer, setCustomer]               = useState<Customer | null>(null);
  const [purchases, setPurchases]             = useState<CustomerPurchaseItem[]>([]);
  const [repayments, setRepayments]           = useState<CustomerRepayment[]>([]);
  const [showAllPurchases, setShowAllPurchases]   = useState(false);
  const [showAllRepayments, setShowAllRepayments] = useState(false);

  // Edit profile
  const [editing, setEditing]       = useState(false);
  const [editName, setEditName]     = useState('');
  const [editPhone, setEditPhone]   = useState('');
  const [editError, setEditError]   = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Inline repayment
  const [amount, setAmount]               = useState('');
  const [method, setMethod]               = useState<PaymentMethod>('CASH');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError]   = useState('');

  const load = async () => {
    if (!customerId) return;
    const [person, purchaseItems, paymentItems] = await Promise.all([
      getCustomer(db, ownerId, customerId),
      listCustomerPurchaseItems(db, ownerId, customerId),
      listCustomerRepayments(db, ownerId, customerId),
    ]);
    setCustomer(person);
    setPurchases(purchaseItems);
    setRepayments(paymentItems);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [db, ownerId, customerId, revision]);

  const saveProfile = async () => {
    if (!customer) return;
    setEditError(''); setEditSaving(true);
    try {
      await updateCustomer(db, ownerId, customer, editName, editPhone);
      setEditing(false); await load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not update this customer.');
    } finally { setEditSaving(false); }
  };

  const saveRepayment = async () => {
    if (!customerId || !customer) return;
    setPaymentError('');
    const cents = toCents(amount);
    if (!cents) { setPaymentError('Enter an amount greater than zero.'); return; }
    setSavingPayment(true);
    try {
      await recordRepayment(db, ownerId, customerId, cents, method, '');
      setAmount(''); await load();
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : 'Could not record this payment.');
    } finally { setSavingPayment(false); }
  };

  if (!customer) {
    return (
      <Page title="Customer account" back>
        <View className="rounded-2xl border border-line bg-surface px-4 py-6 items-center">
          <AppText color={colors.secondary}>Loading customer account…</AppText>
        </View>
      </Page>
    );
  }

  const paid = repayments.reduce((s, r) => s + r.amount_cents, 0);
  const totalCharged = purchases.reduce((s, p) => s + p.line_total_cents, 0);
  const visiblePurchases = showAllPurchases ? purchases : purchases.slice(0, 4);
  const visibleRepayments = showAllRepayments ? repayments : repayments.slice(0, 4);

  const methodOptions: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { key: 'CASH',    label: 'Cash',    icon: <Banknote  size={16} color={colors.success} /> },
    { key: 'ECOCASH', label: 'EcoCash', icon: <Smartphone size={16} color={colors.info} /> },
    { key: 'CARD',    label: 'Card',    icon: <WalletCards size={16} color={colors.purple} /> },
  ];

  return (
    <Page title={customer.name} subtitle="Customer account" back>

      {/* ── Profile card ── */}
      <View
        className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm"
      >
        <View className={`h-14 w-14 items-center justify-center rounded-full ${avatarBg(customer.name)}`}>
          <AppText variant="heading" color={colors.surface} style={{ fontSize: 20 }}>
            {initials(customer.name)}
          </AppText>
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <AppText variant="heading" style={{ fontSize: 16 }} numberOfLines={1}>{customer.name}</AppText>
          <View className="flex-row items-center gap-1.5">
            <Phone size={12} color={colors.secondary} />
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 12 }}>
              {customer.phone || 'No phone number'}
            </AppText>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit customer"
          onPress={() => { setEditName(customer.name); setEditPhone(customer.phone ?? ''); setEditError(''); setEditing((v) => !v); }}
          className="h-9 w-9 items-center justify-center rounded-xl bg-brand-tint active:opacity-75"
        >
          <Pencil size={15} color={colors.purple} />
        </Pressable>
      </View>

      {/* ── Edit form ── */}
      {editing ? (
        <View className="gap-3 rounded-2xl border border-brand/30 bg-brand-tint px-4 py-4">
          <AppText variant="heading" style={{ fontSize: 15 }}>Edit customer</AppText>
          <Field label="Customer name" value={editName} onChangeText={setEditName} autoCapitalize="words" />
          <Field label="Phone number" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" placeholder="Add phone number" />
          {editError ? (
            <View className="rounded-xl bg-danger/10 px-3 py-2">
              <AppText variant="small" color={colors.danger}>{editError}</AppText>
            </View>
          ) : null}
          <View className="flex-row gap-2.5">
            <Pressable
              accessibilityRole="button"
              onPress={() => void saveProfile()}
              className={`min-h-[46px] flex-1 items-center justify-center rounded-xl ${editSaving ? 'bg-brand/60' : 'bg-brand'} active:opacity-80`}
            >
              <AppText variant="label" color={colors.surface}>{editSaving ? 'Saving…' : 'Save changes'}</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditing(false)}
              className="min-h-[46px] flex-1 items-center justify-center rounded-xl border border-line bg-surface active:opacity-80"
            >
              <AppText variant="label" color={colors.deepPurple}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── Balance + stats row ── */}
      <View className="flex-row gap-2.5">
        {/* Outstanding balance */}
        <View
          className="min-w-0 flex-1 gap-1 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm"
        >
          <AppText variant="small" color={colors.secondary} style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Outstanding
          </AppText>
          <AppText
            variant="amount"
            color={customer.balance_cents > 0 ? colors.danger : colors.success}
            style={{ fontSize: 20 }}
          >
            {formatMoney(customer.balance_cents)}
          </AppText>
          <View className={`self-start rounded-full px-2 py-0.5 ${customer.balance_cents > 0 ? 'bg-danger/10' : 'bg-success/10'}`}>
            <AppText variant="small" color={customer.balance_cents > 0 ? colors.danger : colors.success} style={{ fontSize: 10 }}>
              {customer.balance_cents > 0 ? 'Owing' : 'Paid up'}
            </AppText>
          </View>
        </View>
        {/* Paid / charged */}
        <View className="min-w-0 flex-1 gap-2">
          <View className="gap-0.5 rounded-xl border border-line bg-surface px-3 py-2">
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 10 }}>Total paid</AppText>
            <AppText variant="label" color={colors.success} style={{ fontSize: 14 }}>{formatMoney(paid)}</AppText>
          </View>
          <View className="gap-0.5 rounded-xl border border-line bg-surface px-3 py-2">
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 10 }}>Total charged</AppText>
            <AppText variant="label" color={colors.deepPurple} style={{ fontSize: 14 }}>{formatMoney(totalCharged)}</AppText>
          </View>
        </View>
      </View>

      {/* ── Action buttons ── */}
      <View className="flex-row gap-2.5">
        <PrimaryButton
          label="Record payment"
          onPress={() => router.push({ pathname: '/credit/repayment', params: { customerId: customer.id } })}
          icon={<Banknote size={16} color={colors.surface} />}
          style={{ flex: 1 }}
        />
        <SecondaryButton
          label="New credit sale"
          onPress={() => {
            useCart.getState().clear();
            useCart.getState().setCreditMode(true, customer.id);
            router.push('/(tabs)/sales');
          }}
          style={{ flex: 1 }}
        />
      </View>

      {/* ── Credit purchases ── */}
      <View
        className="gap-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
          <View className="flex-row items-center gap-2">
            <View className="h-7 w-7 items-center justify-center rounded-lg bg-brand-tint">
              <CreditCard size={14} color={colors.deepPurple} />
            </View>
            <AppText variant="label" style={{ fontSize: 14 }}>Credit purchases</AppText>
          </View>
          <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>
            {purchases.length} {purchases.length === 1 ? 'item' : 'items'}
          </AppText>
        </View>

        {/* Rows */}
        {purchases.length ? (
          <>
            {visiblePurchases.map((item, idx) => {
              const isLast = idx === visiblePurchases.length - 1 && (showAllPurchases || purchases.length <= 4);
              return (
                <View key={item.id} className={`flex-row items-center gap-3 px-4 py-2.5 ${isLast ? '' : 'border-b border-line'}`}>
                  <View className="h-8 w-8 items-center justify-center rounded-lg bg-brand-tint">
                    <ArrowUpRight size={14} color={colors.deepPurple} />
                  </View>
                  <AppText variant="small" numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
                    {item.product_name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}
                  </AppText>
                  <AppText variant="label" color={colors.deepPurple} style={{ fontSize: 12 }}>
                    {formatMoney(item.line_total_cents)}
                  </AppText>
                  <AppText variant="small" color={colors.secondary} style={{ fontSize: 10, minWidth: 52, textAlign: 'right' }}>
                    {formatDate(item.created_at)}
                  </AppText>
                </View>
              );
            })}
            {purchases.length > 4 ? (
              <Pressable
                onPress={() => setShowAllPurchases((v) => !v)}
                className="items-center border-t border-line py-3 active:bg-brand-tint/40"
              >
                <AppText variant="label" color={colors.purple} style={{ fontSize: 12 }}>
                  {showAllPurchases ? 'Show less' : `View all ${purchases.length} purchases`}
                </AppText>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View className="items-center justify-center py-8 gap-2">
            <User size={22} color={colors.secondary} />
            <AppText variant="small" color={colors.secondary}>No credit purchases yet.</AppText>
          </View>
        )}
      </View>

      {/* ── Repayments ── */}
      <View
        className="gap-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
          <View className="flex-row items-center gap-2">
            <View className="h-7 w-7 items-center justify-center rounded-lg bg-success/10">
              <Check size={14} color={colors.success} />
            </View>
            <AppText variant="label" style={{ fontSize: 14 }}>Repayments</AppText>
          </View>
          <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>
            {repayments.length} {repayments.length === 1 ? 'payment' : 'payments'}
          </AppText>
        </View>

        {/* Rows */}
        {repayments.length ? (
          <>
            {visibleRepayments.map((payment, idx) => {
              const isLast = idx === visibleRepayments.length - 1 && (showAllRepayments || repayments.length <= 4);
              const mLabel = payment.method === 'ECOCASH' ? 'EcoCash' : payment.method === 'CARD' ? 'Card' : payment.method === 'OTHER' ? 'Other' : 'Cash';
              return (
                <View key={payment.id} className={`flex-row items-center gap-3 px-4 py-2.5 ${isLast ? '' : 'border-b border-line'}`}>
                  <View className="h-8 w-8 items-center justify-center rounded-lg bg-success/10">
                    <ArrowDownLeft size={14} color={colors.success} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <AppText variant="small" style={{ fontSize: 12 }}>Payment · {mLabel}</AppText>
                    <AppText variant="small" color={colors.secondary} style={{ fontSize: 10 }}>{formatDate(payment.created_at)}</AppText>
                  </View>
                  <AppText variant="label" color={colors.success} style={{ fontSize: 13 }}>
                    {formatMoney(payment.amount_cents)}
                  </AppText>
                </View>
              );
            })}
            {repayments.length > 4 ? (
              <Pressable
                onPress={() => setShowAllRepayments((v) => !v)}
                className="items-center border-t border-line py-3 active:bg-brand-tint/40"
              >
                <AppText variant="label" color={colors.purple} style={{ fontSize: 12 }}>
                  {showAllRepayments ? 'Show less' : `View all ${repayments.length} payments`}
                </AppText>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View className="items-center justify-center py-8 gap-2">
            <CircleDollarSign size={22} color={colors.secondary} />
            <AppText variant="small" color={colors.secondary}>No repayments recorded yet.</AppText>
          </View>
        )}
      </View>

      {/* ── Quick repayment form ── */}
      {customer.balance_cents > 0 ? (
        <View className="gap-3 rounded-2xl border border-brand/20 bg-brand-tint px-4 py-4">
          <AppText variant="heading" style={{ fontSize: 15 }}>Quick payment</AppText>

          <Field
            label="Amount received"
            value={amount}
            onChangeText={(v) => { setAmount(v); setPaymentError(''); }}
            placeholder="0.00"
            keyboardType="decimal-pad"
            icon={<AppText variant="label" color={colors.secondary}>$</AppText>}
          />

          {/* Method pills */}
          <View className="gap-1.5">
            <AppText variant="label" color={colors.secondary} style={{ fontSize: 11 }}>Payment method</AppText>
            <View className="flex-row gap-2">
              {methodOptions.map((m) => {
                const selected = method === m.key;
                return (
                  <Pressable
                    key={m.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setMethod(m.key)}
                    className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border active:opacity-80 ${selected ? 'border-brand bg-surface' : 'border-line bg-surface/60'}`}
                  >
                    {m.icon}
                    <AppText variant="small" color={selected ? colors.deepPurple : colors.secondary} style={{ fontSize: 11 }}>
                      {m.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {paymentError ? (
            <View className="rounded-xl bg-danger/10 px-3 py-2">
              <AppText variant="small" color={colors.danger}>{paymentError}</AppText>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => void saveRepayment()}
            disabled={savingPayment}
            className={`min-h-[46px] flex-row items-center justify-center gap-2 rounded-xl ${savingPayment ? 'bg-brand/60' : 'bg-brand'} active:opacity-80`}
          >
            <Banknote size={16} color={colors.surface} />
            <AppText variant="label" color={colors.surface}>
              {savingPayment ? 'Saving…' : 'Record payment'}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-center gap-3 rounded-2xl border border-success/20 bg-success/5 px-4 py-4">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-success/10">
            <Check size={18} color={colors.success} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText variant="label" color={colors.success} style={{ fontSize: 14 }}>Account is clear</AppText>
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 12 }}>This customer has no outstanding balance.</AppText>
          </View>
        </View>
      )}

    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RepaymentScreen
// ─────────────────────────────────────────────────────────────────────────────

export function RepaymentScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const params = useLocalSearchParams<{ customerId?: string }>();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [amount, setAmount]     = useState('');
  const [method, setMethod]     = useState<PaymentMethod>('CASH');
  const [note, setNote]         = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (customerId) void getCustomer(db, ownerId, customerId).then(setCustomer);
  }, [db, ownerId, customerId]);

  const save = async () => {
    setError('');
    if (!customerId || !customer) { setError('Choose a customer account first.'); return; }
    const cents = toCents(amount);
    if (!cents) { setError('Enter a repayment amount greater than zero.'); return; }
    setBusy(true);
    try {
      await recordRepayment(db, ownerId, customerId, cents, method, note);
      Alert.alert('Payment saved', 'The customer balance is now updated.');
      router.replace({ pathname: '/credit/[customerId]', params: { customerId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save this payment.');
    } finally { setBusy(false); }
  };

  const methodOptions: { key: PaymentMethod; label: string; detail: string; icon: React.ReactNode }[] = [
    { key: 'CASH',    label: 'Cash',    detail: 'Paid in person',  icon: <Banknote   size={18} color={colors.success} /> },
    { key: 'ECOCASH', label: 'EcoCash', detail: 'Mobile money',    icon: <Smartphone size={18} color={colors.info} /> },
    { key: 'CARD',    label: 'Card',    detail: 'Other payment',   icon: <WalletCards size={18} color={colors.purple} /> },
  ];

  return (
    <Page title="Record payment" subtitle="Save a customer repayment to their account." back>

      {/* ── Customer summary ── */}
      {customer ? (
        <View
          className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
          style={{ shadowColor: '#202033', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}
        >
          <View className={`h-12 w-12 items-center justify-center rounded-full ${avatarBg(customer.name)}`}>
            <AppText variant="label" color={colors.surface} style={{ fontSize: 15 }}>{initials(customer.name)}</AppText>
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <AppText variant="label" style={{ fontSize: 14 }} numberOfLines={1}>{customer.name}</AppText>
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 12 }}>Current balance</AppText>
          </View>
          <View className="items-end gap-0.5">
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>Owed</AppText>
            <AppText variant="amount" color={colors.warning} style={{ fontSize: 20 }}>{formatMoney(customer.balance_cents)}</AppText>
          </View>
        </View>
      ) : null}

      {/* ── Payment form ── */}
      <View
        className="gap-4 rounded-2xl border border-line bg-surface px-4 py-4"
        style={{ shadowColor: '#202033', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}
      >
        <AppText variant="heading" style={{ fontSize: 15 }}>Payment details</AppText>

        <Field
          label="Amount received"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          icon={<AppText variant="label" color={colors.secondary}>$</AppText>}
        />

        {/* Method options */}
        <View className="gap-2">
          <AppText variant="label" style={{ fontSize: 13 }}>Payment method</AppText>
          {methodOptions.map((m) => {
            const selected = method === m.key;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="radio"
                accessibilityLabel={`${m.label}: ${m.detail}`}
                accessibilityState={{ checked: selected }}
                onPress={() => setMethod(m.key)}
                className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 active:opacity-80 ${selected ? 'border-brand bg-brand-tint' : 'border-line bg-surface'}`}
              >
                {/* Icon box */}
                <View className={`h-9 w-9 items-center justify-center rounded-xl ${selected ? 'bg-surface' : 'bg-canvas'}`}>
                  {m.icon}
                </View>
                {/* Labels */}
                <View className="min-w-0 flex-1">
                  <AppText variant="label" color={selected ? colors.deepPurple : colors.text} style={{ fontSize: 13 }}>
                    {m.label}
                  </AppText>
                  <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>{m.detail}</AppText>
                </View>
                {/* Radio */}
                <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? 'border-brand' : 'border-line'}`}>
                  {selected ? <View className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Field
          label="Note (optional)"
          placeholder="Add a short note"
          value={note}
          onChangeText={setNote}
          multiline
        />
      </View>

      {/* ── Error ── */}
      {error ? (
        <View className="rounded-2xl bg-danger/10 px-4 py-3">
          <AppText variant="small" color={colors.danger}>{error}</AppText>
        </View>
      ) : null}

      {/* ── Save button ── */}
      <PrimaryButton
        label={customer?.balance_cents === 0 ? 'Account is already paid' : 'Save payment'}
        loading={busy}
        disabled={!customer || customer.balance_cents <= 0}
        onPress={() => void save()}
        icon={<CreditCard size={18} color="#fff" />}
      />

    </Page>
  );
}

// All layout uses NativeWind className — no StyleSheet needed in this file.
