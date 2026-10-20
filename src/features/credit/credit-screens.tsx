import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarDays, Check, ChevronRight, CircleDollarSign, CreditCard, Pencil, Plus, Search, Smartphone, WalletCards } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { formatDate, formatMoney, toCents } from '@/lib/format';
import { createCustomer, getCustomer, listAccountEntries, listCustomerPurchaseItems, listCustomerRepayments, listCustomers, updateCustomer } from '@/db/repositories/customers';
import { recordRepayment, listChangeOwed, settleChangeOwed, type ChangeOwedRecord } from '@/db/repositories/sales';
import type { AccountEntry, Customer, CustomerPurchaseItem, CustomerRepayment, PaymentMethod } from '@/db/schema';
import { useCart } from '@/stores/cart';
import { useAuth } from '@/features/auth/auth-context';
import { AppText, Card, Field, Page, PrimaryButton, SecondaryButton, SectionTitle, StatusBadge } from '@/components/ui/primitives';
import { IllustratedEmptyState } from '@/components/feedback/illustrated-empty-state';
import { useSyncStatus } from '@/features/sync/sync-context';

export function CreditCustomersScreen() { return <CustomerList />; }
export function CreditSaleCustomerPicker() { return <CustomerList selectForCreditSale />; }

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
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load local SQLite records when the account scope changes.
  useEffect(() => { void load(); }, [db, ownerId, revision]);
  const save = async () => { setError(''); if (!name.trim()) { setError('Enter the customer’s name to continue.'); return; } setSaving(true); try { await createCustomer(db, ownerId, name, phone); setName(''); setPhone(''); setAdding(false); await load(); } catch (value) { setError(value instanceof Error ? value.message : 'Could not save this customer.'); } finally { setSaving(false); } };
  const filtered = customers.filter((customer) => (!balanceOnly || customer.balance_cents > 0) && (customer.name + ' ' + (customer.phone ?? '')).toLowerCase().includes(search.toLowerCase()));
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
    }
    else router.push({ pathname: '/credit/[customerId]', params: { customerId: customer.id } });
  };
  return <Page title={selectForCreditSale ? selectingChangeCustomer ? 'Change collection' : 'Choose a customer' : 'Customers'} subtitle={selectForCreditSale ? selectingChangeCustomer ? 'Choose who will collect the change from this sale.' : 'Select who will receive this sale on account.' : 'Track balances and repayments.'} back={selectForCreditSale} right={!selectForCreditSale ? <Pressable accessibilityRole="button" accessibilityLabel="Add customer" onPress={() => setAdding((value) => !value)} hitSlop={8} style={styles.addIcon}><Plus size={21} stroke="#FFFFFF" /></Pressable> : null}>
    {adding ? <Card style={styles.addCustomerCard}><View style={styles.addCustomerHeading}><View style={styles.addCustomerIcon}><Plus size={17} stroke={colors.deepPurple}/></View><AppText variant="heading">Add a customer</AppText></View><Field label="Customer name" placeholder="e.g. Tinashe Moyo" value={name} onChangeText={(value) => { setName(value); if (error) setError(''); }} autoCapitalize="words" returnKeyType="next" /><Field label="Phone number (optional)" placeholder="+263 77 123 4567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" returnKeyType="done" />{error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}<View style={styles.addCustomerActions}><Pressable accessibilityRole="button" accessibilityLabel="Save customer" onPress={() => void save()} style={styles.saveCustomerButton}><AppText variant="label" color="#FFFFFF">{saving ? 'Saving customer…' : 'Save customer'}</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => { setAdding(false); setError(''); }} style={styles.cancelCustomerButton}><AppText variant="label" color={colors.deepPurple}>Cancel</AppText></Pressable></View></Card> : null}
    <Field label="Search customers" placeholder="Search customers…" value={search} onChangeText={setSearch} icon={<Search size={18} stroke={colors.secondary} />} />
    {!selectForCreditSale ? <View style={styles.filterRow}><Pressable onPress={() => setBalanceOnly(false)} style={[styles.filterChip, !balanceOnly && styles.filterChipActive]}><AppText variant="small" color={!balanceOnly ? '#FFFFFF' : colors.secondary}>All ({customers.length})</AppText></Pressable><Pressable onPress={() => setBalanceOnly(true)} style={[styles.filterChip, balanceOnly && styles.filterChipActive]}><AppText variant="small" color={balanceOnly ? '#FFFFFF' : colors.secondary}>With Balance ({customers.filter((person) => person.balance_cents > 0).length})</AppText></Pressable></View> : null}
    <SectionTitle>{(selectForCreditSale ? 'Customers' : 'Customers') + ' · ' + filtered.length}</SectionTitle>
    {filtered.length ? filtered.map((customer) => <Pressable key={customer.id} onPress={() => choose(customer)}><Card style={styles.customerRow}><View style={styles.customerAvatar}><AppText variant="label" color="#FFFFFF">{customer.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</AppText></View><View style={{ flex: 1 }}><AppText variant="label">{customer.name}</AppText><AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }}>{customer.phone || 'No phone number'}</AppText></View><View style={{ alignItems: 'flex-end', gap: 5 }}><AppText variant="label" color={customer.balance_cents > 0 ? colors.danger : colors.success}>{formatMoney(customer.balance_cents)}</AppText><AppText variant="small" color={colors.secondary}>{customer.balance_cents > 0 ? 'Owed' : 'Clear'}</AppText></View><ChevronRight size={17} stroke={colors.secondary} /></Card></Pressable>) : <IllustratedEmptyState image={require('@/assets/images/shop-illustrations/credit/customer-credit.png')} title={search ? 'No matching customers' : 'No customers yet'} description={selectForCreditSale ? 'Add a customer first, then return here to start their credit sale.' : 'Save customers here to keep their credit sales and payments together.'} action={<PrimaryButton label={search ? 'Clear search' : 'Add your first customer'} onPress={() => search ? setSearch('') : setAdding(true)} />} />}
  </Page>;
}

export function CustomerAccountScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const { revision } = useSyncStatus();
  const params = useLocalSearchParams<{ customerId: string }>();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [purchases, setPurchases] = useState<CustomerPurchaseItem[]>([]);
  const [repayments, setRepayments] = useState<CustomerRepayment[]>([]);
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [showAllRepayments, setShowAllRepayments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [changeOwed, setChangeOwed] = useState<ChangeOwedRecord[]>([]);
  const [settlingId, setSettlingId] = useState('');
  const load = async () => { if (!customerId) return; const [person, history, openChange, purchaseItems, paymentItems] = await Promise.all([getCustomer(db, ownerId, customerId), listAccountEntries(db, ownerId, customerId), listChangeOwed(db, ownerId, { customerId, status: 'OPEN' }), listCustomerPurchaseItems(db, ownerId, customerId), listCustomerRepayments(db, ownerId, customerId)]); setCustomer(person); setEntries(history); setChangeOwed(openChange); setPurchases(purchaseItems); setRepayments(paymentItems); };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load the selected customer ledger from local SQLite.
  useEffect(() => { void load(); }, [db, ownerId, customerId, revision]);
  const settle = async (record: ChangeOwedRecord) => {
    setSettlingId(record.id);
    try { await settleChangeOwed(db, ownerId, record.id); await load(); }
    catch (value) { Alert.alert('Could not return change', value instanceof Error ? value.message : 'Please try again.'); }
    finally { setSettlingId(''); }
  };
  const saveProfile = async () => {
    if (!customer) return;
    setEditError(''); setEditSaving(true);
    try { await updateCustomer(db, ownerId, customer, editName, editPhone); setEditing(false); await load(); }
    catch (value) { setEditError(value instanceof Error ? value.message : 'Could not update this customer.'); }
    finally { setEditSaving(false); }
  };
  if (!customer) return <Page title="Customer account" back><Card><AppText color={colors.secondary}>Loading customer account…</AppText></Card></Page>;
  const charged = entries.filter((entry) => entry.entry_type === 'SALE_CHARGE').reduce((sum, entry) => sum + entry.amount_cents, 0);
  const paid = Math.abs(entries.filter((entry) => entry.entry_type === 'PAYMENT').reduce((sum, entry) => sum + entry.amount_cents, 0));
  return <Page title="Customer Details" back>
    <Card style={styles.profileCard}><View style={[styles.customerAvatar, styles.profileAvatar]}><AppText variant="heading" color="#FFFFFF">{customer.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</AppText></View><View style={{ flex: 1, gap: 4 }}><AppText variant="heading">{customer.name}</AppText><View style={styles.phoneLine}><Smartphone size={14} stroke={colors.secondary}/><AppText variant="small" color={colors.secondary}>{customer.phone || 'Phone number not added'}</AppText></View></View><Pressable accessibilityRole="button" accessibilityLabel="Edit customer" onPress={() => { setEditName(customer.name); setEditPhone(customer.phone ?? ''); setEditError(''); setEditing((value) => !value); }} style={styles.editButton}><Pencil size={16} stroke={colors.info}/></Pressable></Card>
    {editing ? <Card style={styles.editCustomerCard}><AppText variant="heading">Edit customer</AppText><Field label="Customer name" value={editName} onChangeText={setEditName} autoCapitalize="words" /><Field label="Phone number" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" placeholder="Add phone number" />{editError ? <AppText variant="small" color={colors.danger}>{editError}</AppText> : null}<View style={styles.addCustomerActions}><Pressable onPress={() => void saveProfile()} style={styles.saveCustomerButton}><AppText variant="label" color="#FFFFFF">{editSaving ? 'Saving…' : 'Save changes'}</AppText></Pressable><Pressable onPress={() => setEditing(false)} style={styles.cancelCustomerButton}><AppText variant="label" color={colors.deepPurple}>Cancel</AppText></Pressable></View></Card> : null}
    <Card style={styles.balanceFocus}><AppText variant="small" color={colors.danger}>OUTSTANDING BALANCE</AppText><View style={styles.balanceFocusRow}><AppText variant="amount" color={colors.danger}>{formatMoney(customer.balance_cents)}</AppText><StatusBadge label={customer.balance_cents > 0 ? 'Owing' : 'Paid'} tone={customer.balance_cents > 0 ? 'red' : 'green'} /></View></Card>
    <View style={styles.accountSummary}><AppText variant="small" color={colors.secondary}>TOTAL CREDIT PURCHASES</AppText><AppText variant="label">{formatMoney(charged)} · {formatMoney(paid)} repaid</AppText></View>
    <Card style={styles.historyCard}><View style={styles.accountHeading}><AppText variant="heading">Credit Purchases</AppText><Pressable onPress={() => setShowAllPurchases((value) => !value)}><AppText variant="small" color={colors.info}>{showAllPurchases ? 'Show less' : 'View All'}</AppText></Pressable></View>{purchases.length ? (showAllPurchases ? purchases : purchases.slice(0, 3)).map((item) => <View key={item.id} style={styles.entryRow}><View style={[styles.entryIcon, styles.chargeIcon]}><CreditCard size={15} stroke={colors.deepPurple}/></View><View style={{flex:1,minWidth:0}}><AppText variant="label" numberOfLines={1}>{item.product_name}{item.quantity > 1 ? ' × ' + item.quantity : ''}</AppText><AppText variant="small" color={colors.secondary}>{item.receipt_number || 'Credit purchase'} · {formatDate(item.created_at)}</AppText></View><AppText variant="label">{formatMoney(item.line_total_cents)}</AppText></View>) : <AppText variant="small" color={colors.secondary}>Credit purchases will appear here.</AppText>}</Card>
    <Card style={styles.historyCard}><View style={styles.accountHeading}><AppText variant="heading">Repayments History</AppText><Pressable onPress={() => setShowAllRepayments((value) => !value)}><AppText variant="small" color={colors.info}>{showAllRepayments ? 'Show less' : 'View All'}</AppText></Pressable></View>{repayments.length ? (showAllRepayments ? repayments : repayments.slice(0, 3)).map((payment) => <View key={payment.id} style={styles.entryRow}><View style={[styles.entryIcon, styles.paymentIcon]}><Check size={15} stroke={colors.success}/></View><View style={{flex:1,minWidth:0}}><AppText variant="label">Payment ({payment.method === 'ECOCASH' ? 'EcoCash' : payment.method === 'CARD' ? 'Card' : payment.method === 'OTHER' ? 'Other' : 'Cash'})</AppText><AppText variant="small" color={colors.secondary}>{formatDate(payment.created_at)}{payment.note ? ' · ' + payment.note : ''}</AppText></View><AppText variant="label" color={colors.success}>{formatMoney(payment.amount_cents)}</AppText></View>) : <AppText variant="small" color={colors.secondary}>Repayments will appear here.</AppText>}</Card>
    {changeOwed.length ? <Card style={styles.changeOwedCard}><View style={styles.accountHeading}><View style={styles.metricHeading}><WalletCards size={16} stroke={colors.warning}/><AppText variant="heading">Change owed by shop</AppText></View><AppText variant="label" color={colors.warning}>{formatMoney(changeOwed.reduce((sum, record) => sum + record.amount_cents, 0))}</AppText></View><AppText variant="small" color={colors.secondary}>This is change the shop must return — it is separate from the customer’s credit balance.</AppText>{changeOwed.map((record) => <View key={record.id} style={styles.changeOwedRow}><View style={{ flex: 1, minWidth: 0 }}><AppText variant="label" numberOfLines={1}>{record.receipt_number ? 'Sale ' + record.receipt_number : 'Sale change'}</AppText><View style={styles.entryMeta}><CalendarDays size={12} stroke={colors.secondary}/><AppText variant="small" color={colors.secondary}>{formatDate(record.created_at)}</AppText></View></View><AppText variant="label" color={colors.text}>{formatMoney(record.amount_cents)}</AppText><Pressable accessibilityRole="button" accessibilityLabel={"Return " + formatMoney(record.amount_cents) + " change for " + (record.receipt_number || 'sale')} disabled={settlingId === record.id} onPress={() => void settle(record)} style={[styles.settleButton, settlingId === record.id && styles.settleButtonDisabled]}><AppText variant="label" color={colors.deepPurple}>{settlingId === record.id ? 'Saving…' : 'Return change'}</AppText></Pressable></View>)}</Card> : null}
    <Card style={styles.historyCard}><View style={styles.accountHeading}><View><AppText variant="heading">Account history</AppText><AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }}>{entries.length} {entries.length === 1 ? 'transaction' : 'transactions'}</AppText></View><View style={styles.chargedPill}><AppText variant="small" color={colors.deepPurple}>{formatMoney(charged)} charged</AppText></View></View>{entries.length ? entries.map((entry) => <View key={entry.id} style={styles.entryRow}><View style={[styles.entryIcon, entry.entry_type === 'PAYMENT' ? styles.paymentIcon : styles.chargeIcon]}>{entry.entry_type === 'PAYMENT' ? <ArrowDownLeft size={17} stroke={colors.success} /> : <ArrowUpRight size={17} stroke={colors.deepPurple} />}</View><View style={{ flex: 1, minWidth: 0 }}><AppText variant="label" numberOfLines={1}>{entry.note || (entry.entry_type === 'PAYMENT' ? 'Payment received' : 'Credit sale')}</AppText><View style={styles.entryMeta}><CalendarDays size={12} stroke={colors.secondary}/><AppText variant="small" color={colors.secondary} numberOfLines={1}>{formatDate(entry.created_at)}{entry.receipt_number ? ' · ' + entry.receipt_number : ''}</AppText></View></View><AppText variant="label" color={entry.amount_cents < 0 ? colors.success : colors.text}>{entry.amount_cents < 0 ? '−' : '+'}{formatMoney(Math.abs(entry.amount_cents))}</AppText></View>) : <View style={styles.noHistory}><CreditCard size={22} stroke={colors.secondary}/><AppText variant="small" color={colors.secondary}>Credit sales and repayments will appear here.</AppText></View>}</Card>
    <PrimaryButton label="Record Repayment" onPress={() => router.push({ pathname: '/credit/repayment', params: { customerId: customer.id } })} icon={<Banknote size={17} stroke="#FFFFFF"/>} />
    <SecondaryButton label="New credit sale" onPress={() => { useCart.getState().clear(); useCart.getState().setCreditMode(true, customer.id); router.push('/(tabs)/sales'); }} />
  </Page>;
}

export function RepaymentScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
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

const styles = StyleSheet.create({ filterRow: { flexDirection: 'row', gap: 8 }, filterChip: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border }, filterChipActive: { backgroundColor: colors.purple, borderColor: colors.purple }, balanceFocus: { gap: 5, backgroundColor: colors.dangerTint, borderColor: colors.dangerTint }, balanceFocusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, editButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.infoTint }, editCustomerCard: { gap: 12, backgroundColor: '#FFFFFF' }, addIcon: { width: 42, height: 42, backgroundColor: colors.purple, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, addCustomerCard: { gap: 13, backgroundColor: '#FFFFFF' }, addCustomerHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 1 }, addCustomerIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavenderTint }, addCustomerActions: { flexDirection: 'row', gap: 10, marginTop: 2 }, saveCustomerButton: { flex: 1, minWidth: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 14, backgroundColor: colors.purple }, saveCustomerButtonDisabled: { opacity: 0.55 }, saveCustomerButtonPressed: { opacity: 0.86 }, cancelCustomerButton: { flex: 1, minWidth: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: '#FFFFFF' }, summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 11 }, summaryIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.lavenderTint, alignItems: 'center', justifyContent: 'center' }, customerRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, backgroundColor: '#FFFFFF' }, customerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.info, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', gap: 10, padding: 20 }, actionRow: { flexDirection: 'row', gap: 9 }, profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF' }, profileAvatar: { width: 52, height: 52, borderRadius: 26 }, phoneLine: { flexDirection: 'row', alignItems: 'center', gap: 5 }, accountState: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }, accountStateOwed: { backgroundColor: '#FFF5DC' }, accountStateClear: { backgroundColor: '#E7F5EF' }, balanceGrid: { flexDirection: 'row', gap: 10 }, balanceTile: { flex: 1, gap: 9, padding: 13, backgroundColor: '#FFFFFF' }, owedBalanceTile: { flex: 1, gap: 9, padding: 13, backgroundColor: '#FFFFFF', borderColor: '#F0DCAA' }, metricHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 }, accountSummary: { gap: 5, paddingHorizontal: 4 }, accountHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, historyCard: { gap: 8, backgroundColor: '#FFFFFF' }, chargedPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 11, backgroundColor: colors.lavenderTint }, entryRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, entryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, entryMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }, paymentIcon: { backgroundColor: '#E7F5EF' }, chargeIcon: { backgroundColor: colors.lavenderTint }, noHistory: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 8 }, repaymentSummary: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFFFF' }, repaymentForm: { gap: 16, backgroundColor: '#FFFFFF' }, methodList: { gap: 8 }, methodOption: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: '#FFFFFF' }, methodOptionSelected: { borderColor: colors.purple, backgroundColor: '#F7F4FF' }, methodIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F1F2F8' }, methodIconSelected: { backgroundColor: colors.lavenderTint }, radioOuter: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#A4A4B5', borderRadius: 10 }, radioOuterSelected: { borderColor: colors.purple }, radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.purple }, errorBox: { padding: 12, borderRadius: 12, backgroundColor: '#FCEBED' }, changeOwedCard: { gap: 10, padding: 13, backgroundColor: '#FFFFFF', borderColor: '#F0DCAA' }, changeOwedRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, settleButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.lavenderTint }, settleButtonDisabled: { opacity: 0.55 } });
