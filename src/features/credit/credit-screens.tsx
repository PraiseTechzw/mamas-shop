import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarDays, Check, ChevronRight, CircleDollarSign, CreditCard, Plus, Search, Smartphone, WalletCards } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { formatDate, formatMoney, toCents } from '@/lib/format';
import { createCustomer, getCustomer, listAccountEntries, listCustomers } from '@/db/repositories/customers';
import { recordRepayment } from '@/db/repositories/sales';
import type { AccountEntry, Customer, PaymentMethod } from '@/db/schema';
import { useCart } from '@/stores/cart';
import { useAuth } from '@/features/auth/auth-context';
import { AppText, Card, Field, Page, PrimaryButton, SecondaryButton, SectionTitle, StatusBadge } from '@/components/ui/primitives';
import { IllustratedEmptyState } from '@/components/feedback/illustrated-empty-state';

export function CreditCustomersScreen() { return <CustomerList />; }
export function CreditSaleCustomerPicker() { return <CustomerList selectForCreditSale />; }

function CustomerList({ selectForCreditSale = false }: { selectForCreditSale?: boolean }) {
  const params = useLocalSearchParams<{ preserveCart?: string; purpose?: string }>();
  const preserveCart = params.preserveCart === 'true';
  const selectingChangeCustomer = params.purpose === 'change';
  const db = useSQLiteContext();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? '';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = async () => setCustomers(await listCustomers(db, ownerId));
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load local SQLite records when the account scope changes.
  useEffect(() => { void load(); }, [db, ownerId]);
  const save = async () => { setError(''); if (!name.trim()) { setError('Enter the customer’s name to continue.'); return; } setSaving(true); try { await createCustomer(db, ownerId, name, phone); setName(''); setPhone(''); setAdding(false); await load(); } catch (value) { setError(value instanceof Error ? value.message : 'Could not save this customer.'); } finally { setSaving(false); } };
  const filtered = customers.filter((customer) => (customer.name + ' ' + (customer.phone ?? '')).toLowerCase().includes(search.toLowerCase()));
  const choose = (customer: Customer) => {
    if (selectForCreditSale) {
      if (!preserveCart) useCart.getState().clear();
      if (selectingChangeCustomer) {
        useCart.getState().setCreditCustomer(customer.id);
        router.back();
      } else {
        useCart.getState().setCreditMode(true, customer.id);
        if (preserveCart) router.back();
        else router.push('/sales/new');
      }
    }
    else router.push({ pathname: '/credit/[customerId]', params: { customerId: customer.id } });
  };
  return <Page title={selectForCreditSale ? selectingChangeCustomer ? 'Change collection' : 'Choose a customer' : 'Credit customers'} subtitle={selectForCreditSale ? selectingChangeCustomer ? 'Choose who will collect the change from this sale.' : 'Select who will receive this sale on account.' : 'Track balances and repayments.'} back={selectForCreditSale} right={!selectForCreditSale ? <Pressable accessibilityRole="button" accessibilityLabel="Add customer" onPress={() => setAdding((value) => !value)} hitSlop={8} style={styles.addIcon}><Plus size={21} stroke="#FFFFFF" /></Pressable> : null}>
    {adding ? <Card style={styles.addCustomerCard}><View style={styles.addCustomerHeading}><View style={styles.addCustomerIcon}><Plus size={17} stroke={colors.deepPurple}/></View><AppText variant="heading">Add a customer</AppText></View><Field label="Customer name" placeholder="e.g. Tinashe Moyo" value={name} onChangeText={(value) => { setName(value); if (error) setError(''); }} autoCapitalize="words" returnKeyType="next" /><Field label="Phone number (optional)" placeholder="+263 77 123 4567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" returnKeyType="done" />{error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}<View style={styles.addCustomerActions}><Pressable accessibilityRole="button" accessibilityLabel="Save customer" onPress={() => void save()} style={styles.saveCustomerButton}><AppText variant="label" color="#FFFFFF">{saving ? 'Saving customer…' : 'Save customer'}</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => { setAdding(false); setError(''); }} style={styles.cancelCustomerButton}><AppText variant="label" color={colors.deepPurple}>Cancel</AppText></Pressable></View></Card> : null}
    <Field label="Search customers" placeholder="Name or phone number" value={search} onChangeText={setSearch} icon={<Search size={18} stroke={colors.secondary} />} />
    {!selectForCreditSale ? <Card style={styles.summaryCard}><View style={styles.summaryIcon}><CreditCard size={20} stroke={colors.deepPurple} /></View><View style={{ flex: 1 }}><AppText variant="small" color={colors.secondary}>TOTAL CREDIT OWED</AppText><AppText variant="amount">{formatMoney(customers.reduce((sum, person) => sum + person.balance_cents, 0))}</AppText></View><StatusBadge label={String(customers.filter((person) => person.balance_cents > 0).length) + ' accounts'} tone="amber" /></Card> : null}
    <SectionTitle>{(selectForCreditSale ? 'Customers' : 'Customer accounts') + ' · ' + filtered.length}</SectionTitle>
    {filtered.length ? filtered.map((customer) => <Pressable key={customer.id} onPress={() => choose(customer)}><Card style={styles.customerRow}><View style={styles.customerAvatar}><AppText variant="label" color={colors.deepPurple}>{customer.name.slice(0, 1).toUpperCase()}</AppText></View><View style={{ flex: 1 }}><AppText variant="label">{customer.name}</AppText><AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }}>{customer.phone || 'No phone number'}</AppText></View><View style={{ alignItems: 'flex-end', gap: 5 }}><AppText variant="label" color={customer.balance_cents > 0 ? colors.danger : colors.success}>{formatMoney(customer.balance_cents)}</AppText><AppText variant="small" color={colors.secondary}>{customer.balance_cents > 0 ? 'Owed' : 'Clear'}</AppText></View><ChevronRight size={17} stroke={colors.secondary} /></Card></Pressable>) : <IllustratedEmptyState image={require('@/assets/images/shop-illustrations/credit/customer-credit.png')} title={search ? 'No matching customers' : 'No customers yet'} description={selectForCreditSale ? 'Add a customer first, then return here to start their credit sale.' : 'Save customers here to keep their credit sales and payments together.'} action={<PrimaryButton label={search ? 'Clear search' : 'Add your first customer'} onPress={() => search ? setSearch('') : setAdding(true)} />} />}
  </Page>;
}

export function CustomerAccountScreen() {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? '';
  const params = useLocalSearchParams<{ customerId: string }>();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const load = async () => { if (!customerId) return; const [person, history] = await Promise.all([getCustomer(db, ownerId, customerId), listAccountEntries(db, ownerId, customerId)]); setCustomer(person); setEntries(history); };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load the selected customer ledger from local SQLite.
  useEffect(() => { void load(); }, [db, ownerId, customerId]);
  if (!customer) return <Page title="Customer account" back><Card><AppText color={colors.secondary}>Loading customer account…</AppText></Card></Page>;
  const charged = entries.filter((entry) => entry.entry_type === 'SALE_CHARGE').reduce((sum, entry) => sum + entry.amount_cents, 0);
  const paid = Math.abs(entries.filter((entry) => entry.entry_type === 'PAYMENT').reduce((sum, entry) => sum + entry.amount_cents, 0));
  return <Page title={customer.name} subtitle="Customer account" back>
    <Card style={styles.profileCard}><View style={[styles.customerAvatar, styles.profileAvatar]}><AppText variant="heading" color={colors.deepPurple}>{customer.name[0]?.toUpperCase()}</AppText></View><View style={{ flex: 1, gap: 4 }}><AppText variant="heading">{customer.name}</AppText><View style={styles.phoneLine}><Smartphone size={14} stroke={colors.secondary}/><AppText variant="small" color={colors.secondary}>{customer.phone || 'Phone number not added'}</AppText></View></View><View style={[styles.accountState, customer.balance_cents > 0 ? styles.accountStateOwed : styles.accountStateClear]}><AppText variant="small" color={customer.balance_cents > 0 ? colors.warning : colors.success}>{customer.balance_cents > 0 ? 'Owing' : 'Clear'}</AppText></View></Card>
    <View style={styles.balanceGrid}><Card style={styles.owedBalanceTile}><View style={styles.metricHeading}><CircleDollarSign size={16} stroke={colors.warning}/><AppText variant="small" color={colors.secondary}>TOTAL OWED</AppText></View><AppText variant="amount" color={colors.text}>{formatMoney(customer.balance_cents)}</AppText></Card><Card style={styles.balanceTile}><View style={styles.metricHeading}><Check size={16} stroke={colors.success}/><AppText variant="small" color={colors.secondary}>TOTAL PAID</AppText></View><AppText variant="amount" color={colors.success}>{formatMoney(paid)}</AppText></Card></View>
    <View style={styles.actionRow}><PrimaryButton label="Record payment" onPress={() => router.push({ pathname: '/credit/repayment', params: { customerId: customer.id } })} icon={<Banknote size={17} stroke="#FFFFFF"/>} style={{ flex: 1 }} /><SecondaryButton label="New credit sale" onPress={() => { useCart.getState().clear(); useCart.getState().setCreditMode(true, customer.id); router.push('/sales/new'); }} style={{ flex: 1 }} /></View>
    <Card style={styles.historyCard}><View style={styles.accountHeading}><View><AppText variant="heading">Account history</AppText><AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }}>{entries.length} {entries.length === 1 ? 'transaction' : 'transactions'}</AppText></View><View style={styles.chargedPill}><AppText variant="small" color={colors.deepPurple}>{formatMoney(charged)} charged</AppText></View></View>{entries.length ? entries.map((entry) => <View key={entry.id} style={styles.entryRow}><View style={[styles.entryIcon, entry.entry_type === 'PAYMENT' ? styles.paymentIcon : styles.chargeIcon]}>{entry.entry_type === 'PAYMENT' ? <ArrowDownLeft size={17} stroke={colors.success} /> : <ArrowUpRight size={17} stroke={colors.deepPurple} />}</View><View style={{ flex: 1, minWidth: 0 }}><AppText variant="label" numberOfLines={1}>{entry.note || (entry.entry_type === 'PAYMENT' ? 'Payment received' : 'Credit sale')}</AppText><View style={styles.entryMeta}><CalendarDays size={12} stroke={colors.secondary}/><AppText variant="small" color={colors.secondary} numberOfLines={1}>{formatDate(entry.created_at)}{entry.receipt_number ? ' · ' + entry.receipt_number : ''}</AppText></View></View><AppText variant="label" color={entry.amount_cents < 0 ? colors.success : colors.text}>{entry.amount_cents < 0 ? '−' : '+'}{formatMoney(Math.abs(entry.amount_cents))}</AppText></View>) : <View style={styles.noHistory}><CreditCard size={22} stroke={colors.secondary}/><AppText variant="small" color={colors.secondary}>Credit sales and repayments will appear here.</AppText></View>}</Card>
  </Page>;
}

export function RepaymentScreen() {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? '';
  const params = useLocalSearchParams<{ customerId?: string }>();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (customerId) void getCustomer(db, ownerId, customerId).then(setCustomer); }, [db, ownerId, customerId]);
  const save = async () => {
    setError('');
    if (!customerId || !customer) { setError('Choose a customer account first.'); return; }
    const cents = toCents(amount);
    if (!cents) { setError('Enter a repayment amount greater than zero.'); return; }
    setBusy(true);
    try { await recordRepayment(db, ownerId, customerId, cents, method, note); Alert.alert('Payment saved', 'The customer balance is now updated.'); router.replace({ pathname: '/credit/[customerId]', params: { customerId } }); }
    catch (value) { setError(value instanceof Error ? value.message : 'We could not save this payment.'); }
    finally { setBusy(false); }
  };
  return <Page title="Record payment" subtitle="Save a customer repayment to their account." back>
    {customer ? <Card style={styles.repaymentSummary}><View style={styles.summaryIcon}><CircleDollarSign size={20} stroke={colors.deepPurple}/></View><View style={{ flex: 1, gap: 3 }}><AppText variant="label">{customer.name}</AppText><AppText variant="small" color={colors.secondary}>Current balance</AppText></View><View style={{ alignItems: 'flex-end', gap: 3 }}><AppText variant="small" color={colors.secondary}>OWED</AppText><AppText variant="amount" color={colors.warning}>{formatMoney(customer.balance_cents)}</AppText></View></Card> : null}
    <Card style={styles.repaymentForm}><AppText variant="heading">Payment details</AppText><Field label="Amount received" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" icon={<AppText variant="label" color={colors.secondary}>$</AppText>} /><View style={{ gap: 9 }}><AppText variant="label">Payment method</AppText><View style={styles.methodList}>{(['CASH', 'ECOCASH', 'CARD'] as PaymentMethod[]).map((item) => { const selected = method === item; const MethodIcon = item === 'CASH' ? Banknote : item === 'ECOCASH' ? Smartphone : WalletCards; return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} key={item} onPress={() => setMethod(item)} style={[styles.methodOption, selected && styles.methodOptionSelected]}><View style={[styles.methodIcon, selected && styles.methodIconSelected]}><MethodIcon size={18} stroke={selected ? colors.deepPurple : colors.secondary}/></View><View style={{ flex: 1 }}><AppText variant="label" color={selected ? colors.deepPurple : colors.text}>{item === 'ECOCASH' ? 'EcoCash' : item === 'CARD' ? 'Card / Other' : 'Cash'}</AppText><AppText variant="small" color={colors.secondary}>{item === 'CASH' ? 'Paid in person' : item === 'ECOCASH' ? 'Mobile money' : 'Other payment'}</AppText></View><View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>{selected ? <View style={styles.radioInner}/> : null}</View></Pressable>; })}</View></View><Field label="Note (optional)" placeholder="Add a short note" value={note} onChangeText={setNote} multiline /></Card>
    {error ? <View style={styles.errorBox}><AppText variant="small" color={colors.danger}>{error}</AppText></View> : null}
    <PrimaryButton label={customer?.balance_cents === 0 ? 'Account is paid' : 'Save payment'} loading={busy} disabled={!customer || customer.balance_cents <= 0} onPress={save} icon={<CreditCard size={18} stroke="#fff" />} />
  </Page>;
}

const styles = StyleSheet.create({ addIcon: { width: 42, height: 42, backgroundColor: colors.purple, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, addCustomerCard: { gap: 13, backgroundColor: '#FFFFFF' }, addCustomerHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 1 }, addCustomerIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavenderTint }, addCustomerActions: { flexDirection: 'row', gap: 10, marginTop: 2 }, saveCustomerButton: { flex: 1, minWidth: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 14, backgroundColor: colors.purple }, saveCustomerButtonDisabled: { opacity: 0.55 }, saveCustomerButtonPressed: { opacity: 0.86 }, cancelCustomerButton: { flex: 1, minWidth: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: '#FFFFFF' }, summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 11 }, summaryIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.lavenderTint, alignItems: 'center', justifyContent: 'center' }, customerRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, backgroundColor: '#FFFFFF' }, customerAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.lavenderTint, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', gap: 10, padding: 20 }, actionRow: { flexDirection: 'row', gap: 9 }, profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF' }, profileAvatar: { width: 52, height: 52, borderRadius: 17 }, phoneLine: { flexDirection: 'row', alignItems: 'center', gap: 5 }, accountState: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }, accountStateOwed: { backgroundColor: '#FFF5DC' }, accountStateClear: { backgroundColor: '#E7F5EF' }, balanceGrid: { flexDirection: 'row', gap: 10 }, balanceTile: { flex: 1, gap: 9, padding: 13, backgroundColor: '#FFFFFF' }, owedBalanceTile: { flex: 1, gap: 9, padding: 13, backgroundColor: '#FFFFFF', borderColor: '#F0DCAA' }, metricHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 }, accountHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, historyCard: { gap: 8, backgroundColor: '#FFFFFF' }, chargedPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 11, backgroundColor: colors.lavenderTint }, entryRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, entryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, entryMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }, paymentIcon: { backgroundColor: '#E7F5EF' }, chargeIcon: { backgroundColor: colors.lavenderTint }, noHistory: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 8 }, repaymentSummary: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFFFF' }, repaymentForm: { gap: 16, backgroundColor: '#FFFFFF' }, methodList: { gap: 8 }, methodOption: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: '#FFFFFF' }, methodOptionSelected: { borderColor: colors.purple, backgroundColor: '#F7F4FF' }, methodIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F1F2F8' }, methodIconSelected: { backgroundColor: colors.lavenderTint }, radioOuter: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#A4A4B5', borderRadius: 10 }, radioOuterSelected: { borderColor: colors.purple }, radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.purple }, errorBox: { padding: 12, borderRadius: 12, backgroundColor: '#FCEBED' } });
