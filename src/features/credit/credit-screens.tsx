import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, CreditCard, Plus, Users } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { formatDate, formatMoney, toCents } from '@/lib/format';
import { createCustomer, getCustomer, listAccountEntries, listCustomers } from '@/db/repositories/customers';
import { recordRepayment } from '@/db/repositories/sales';
import type { AccountEntry, Customer, PaymentMethod } from '@/db/schema';
import { useCart } from '@/stores/cart';
import { useAuth } from '@/features/auth/auth-context';
import { AppText, Card, Field, Page, PrimaryButton, SecondaryButton, SectionTitle, StatusBadge } from '@/components/ui/primitives';

export function CreditCustomersScreen() { return <CustomerList />; }
export function CreditSaleCustomerPicker() { return <CustomerList selectForCreditSale />; }

function CustomerList({ selectForCreditSale = false }: { selectForCreditSale?: boolean }) {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? '';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const load = async () => setCustomers(await listCustomers(db, ownerId));
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load local SQLite records when the account scope changes.
  useEffect(() => { void load(); }, [db, ownerId]);
  const save = async () => { setError(''); try { await createCustomer(db, ownerId, name, phone); setName(''); setPhone(''); setAdding(false); await load(); } catch (value) { setError(value instanceof Error ? value.message : 'Could not save this customer.'); } };
  const filtered = customers.filter((customer) => (customer.name + ' ' + (customer.phone ?? '')).toLowerCase().includes(search.toLowerCase()));
  const choose = (customer: Customer) => {
    if (selectForCreditSale) { useCart.getState().clear(); useCart.getState().setCreditMode(true, customer.id); router.push('/sales/new'); }
    else router.push({ pathname: '/credit/[customerId]', params: { customerId: customer.id } });
  };
  return <Page title={selectForCreditSale ? 'Choose a customer' : 'Credit customers'} subtitle={selectForCreditSale ? 'Select who will receive this sale on account.' : 'Follow balances and repayments in one place.'} back={selectForCreditSale} right={!selectForCreditSale ? <Pressable onPress={() => setAdding((value) => !value)} hitSlop={8} style={styles.addIcon}><Plus size={20} stroke={colors.purple} /></Pressable> : null}>
    {adding ? <Card style={{ gap: 11 }}><AppText variant="heading">Add a customer</AppText><Field label="Customer name" placeholder="e.g. Tinashe Moyo" value={name} onChangeText={setName} autoCapitalize="words" /><Field label="Phone number (optional)" placeholder="+263 77 123 4567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />{error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}<View style={styles.actionRow}><SecondaryButton label="Cancel" onPress={() => { setAdding(false); setError(''); }} style={{ flex: 1 }} /><PrimaryButton label="Save customer" onPress={save} style={{ flex: 1 }} /></View></Card> : null}
    <Field label="Search customers" placeholder="Name or phone number" value={search} onChangeText={setSearch} />
    {!selectForCreditSale ? <Card style={styles.summaryCard}><View style={styles.summaryIcon}><CreditCard size={20} stroke={colors.deepPurple} /></View><View style={{ flex: 1 }}><AppText variant="small" color={colors.secondary}>TOTAL CREDIT OWED</AppText><AppText variant="amount">{formatMoney(customers.reduce((sum, person) => sum + person.balance_cents, 0))}</AppText></View><StatusBadge label={String(customers.filter((person) => person.balance_cents > 0).length) + ' accounts'} tone="amber" /></Card> : null}
    <SectionTitle>{(selectForCreditSale ? 'Customers' : 'All customers') + ' · ' + filtered.length}</SectionTitle>
    {filtered.length ? filtered.map((customer) => <Pressable key={customer.id} onPress={() => choose(customer)}><Card style={styles.customerRow}><View style={styles.customerAvatar}><AppText variant="label" color={colors.deepPurple}>{customer.name.slice(0, 1).toUpperCase()}</AppText></View><View style={{ flex: 1 }}><AppText variant="label">{customer.name}</AppText><AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }}>{customer.phone || 'No phone number'}</AppText></View><View style={{ alignItems: 'flex-end', gap: 5 }}><AppText variant="label" color={customer.balance_cents > 0 ? colors.danger : colors.success}>{formatMoney(customer.balance_cents)}</AppText><AppText variant="small" color={colors.secondary}>{customer.balance_cents > 0 ? 'Owed' : 'Clear'}</AppText></View><ChevronRight size={17} stroke={colors.secondary} /></Card></Pressable>) : <Card style={styles.empty}><Users size={27} stroke={colors.lavender} /><AppText variant="heading">{search ? 'No matching customers' : 'No customers yet'}</AppText><AppText color={colors.secondary} style={{ textAlign: 'center', lineHeight: 21 }}>{selectForCreditSale ? 'Add a customer first, then return here to start their credit sale.' : 'Save customers here to keep their credit sales and payments together.'}</AppText><PrimaryButton label={search ? 'Clear search' : 'Add your first customer'} onPress={() => search ? setSearch('') : setAdding(true)} style={{ alignSelf: 'stretch' }} /></Card>}
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
  return <Page title={customer.name} subtitle={customer.phone || 'Customer account'} back>
    <Card style={styles.profileCard}><View style={[styles.customerAvatar, { width: 54, height: 54, borderRadius: 18 }]}><AppText variant="heading" color={colors.deepPurple}>{customer.name[0]?.toUpperCase()}</AppText></View><View style={{ flex: 1 }}><AppText variant="heading">{customer.name}</AppText><AppText variant="small" color={colors.secondary}>{customer.phone || 'Phone number not added'}</AppText></View></Card>
    <View style={styles.balanceGrid}><Card style={styles.balanceTile}><AppText variant="small" color={colors.secondary}>AMOUNT OWED</AppText><AppText variant="amount" color={colors.danger}>{formatMoney(customer.balance_cents)}</AppText></Card><Card style={styles.balanceTile}><AppText variant="small" color={colors.secondary}>TOTAL PAID</AppText><AppText variant="amount" color={colors.success}>{formatMoney(paid)}</AppText></Card></View>
    <View style={styles.actionRow}><SecondaryButton label="Record payment" onPress={() => router.push({ pathname: '/credit/repayment', params: { customerId: customer.id } })} style={{ flex: 1 }} /><PrimaryButton label="New credit sale" onPress={() => { useCart.getState().clear(); useCart.getState().setCreditMode(true, customer.id); router.push('/sales/new'); }} style={{ flex: 1 }} /></View>
    <Card style={{ gap: 12 }}><View style={styles.accountHeading}><AppText variant="heading">Account history</AppText><AppText variant="small" color={colors.secondary}>{formatMoney(charged)} charged</AppText></View>{entries.length ? entries.map((entry) => <View key={entry.id} style={styles.entryRow}><View style={[styles.entryIcon, entry.entry_type === 'PAYMENT' ? styles.paymentIcon : styles.chargeIcon]}>{entry.entry_type === 'PAYMENT' ? <ArrowDownLeft size={17} stroke={colors.success} /> : <ArrowUpRight size={17} stroke={colors.warning} />}</View><View style={{ flex: 1 }}><AppText variant="label">{entry.note || (entry.entry_type === 'PAYMENT' ? 'Payment received' : 'Credit sale')}</AppText><AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }}>{formatDate(entry.created_at)}{entry.receipt_number ? ' · ' + entry.receipt_number : ''}</AppText></View><AppText variant="label" color={entry.amount_cents < 0 ? colors.success : colors.text}>{entry.amount_cents < 0 ? '−' : '+'}{formatMoney(Math.abs(entry.amount_cents))}</AppText></View>) : <AppText color={colors.secondary}>There are no account transactions yet.</AppText>}</Card>
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
    {customer ? <Card style={styles.summaryCard}><View style={styles.customerAvatar}><AppText variant="label" color={colors.deepPurple}>{customer.name[0]?.toUpperCase()}</AppText></View><View style={{ flex: 1 }}><AppText variant="label">{customer.name}</AppText><AppText variant="small" color={colors.secondary}>Balance still owed</AppText></View><AppText variant="amount" color={colors.danger}>{formatMoney(customer.balance_cents)}</AppText></Card> : null}
    <Card style={{ gap: 14 }}><Field label="Amount received" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" /><AppText variant="label">Payment method</AppText><View style={styles.methodWrap}>{(['CASH', 'ECOCASH', 'CARD'] as PaymentMethod[]).map((item) => <Pressable key={item} onPress={() => setMethod(item)} style={[styles.methodChip, method === item && styles.methodChipSelected]}><AppText variant="label" color={method === item ? colors.deepPurple : colors.secondary}>{item === 'ECOCASH' ? 'EcoCash' : item === 'CARD' ? 'Card / Other' : 'Cash'}</AppText></Pressable>)}</View><Field label="Note (optional)" placeholder="Add a short note" value={note} onChangeText={setNote} /></Card>
    {error ? <View style={styles.errorBox}><AppText variant="small" color={colors.danger}>{error}</AppText></View> : null}
    <PrimaryButton label={customer?.balance_cents === 0 ? 'Account is paid' : 'Save payment'} loading={busy} disabled={!customer || customer.balance_cents <= 0} onPress={save} icon={<CreditCard size={18} stroke="#fff" />} />
  </Page>;
}

const styles = StyleSheet.create({ addIcon: { width: 42, height: 42, backgroundColor: '#EEEAFB', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 11 }, summaryIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.lavenderTint, alignItems: 'center', justifyContent: 'center' }, customerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }, customerAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', gap: 10, padding: 20 }, actionRow: { flexDirection: 'row', gap: 9 }, profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }, balanceGrid: { flexDirection: 'row', gap: 10 }, balanceTile: { flex: 1, gap: 7, padding: 13 }, accountHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderColor: colors.border }, entryIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, paymentIcon: { backgroundColor: '#E7F5EF' }, chargeIcon: { backgroundColor: '#FFF5DC' }, methodWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, methodChip: { paddingVertical: 11, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }, methodChipSelected: { backgroundColor: colors.lavenderTint, borderColor: colors.purple }, errorBox: { padding: 12, borderRadius: 12, backgroundColor: '#FCEBED' } });
