import { openMigratedDatabase } from './helpers/sqlite';
import { addProduct } from '@/db/repositories/inventory';
import { createCustomer } from '@/db/repositories/customers';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { getOpenChangeOwedTotal, listChangeOwed, recordSale, settleChangeOwed } from '@/db/repositories/sales';

const OWNER = 'owner-1';

async function seed() {
  const { db, raw } = await openMigratedDatabase();
  await ensureOwnerSeller(db, OWNER, 'Mama');
  const productId = await addProduct(db, OWNER, { name: 'Maheu', sku: 'MH-1', category: 'Drinks', unit: 'bottle', priceCents: 250, costCents: 150, opening: 10, reorder: 2 });
  const location = await raw.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ?', OWNER);
  const customerId = await createCustomer(db, OWNER, 'Tinashe', '+263770000001');
  return { db, raw, productId, locationId: location!.id, customerId };
}

const baseSale = (s: Awaited<ReturnType<typeof seed>>, overrides: Record<string, unknown> = {}) =>
  recordSale(s.db, { items: [{ productId: s.productId, quantity: 2 }], customerId: null, amountPaidCents: 500, method: 'CASH', createdBy: OWNER, sellerId: OWNER, locationId: s.locationId, ownerId: OWNER, ...overrides });

test('overpayment tendered at checkout never becomes a customer balance', async () => {
  const s = await seed();
  const sale = await baseSale(s, { amountPaidCents: 500, amountTenderedCents: 600, changeDueCents: 0 });
  expect(sale.status).toBe('PAID');
  expect(sale.balanceCents).toBe(0);
  const owed = await listChangeOwed(s.db, OWNER, { status: 'ALL' });
  expect(owed).toHaveLength(0);
});

test('paying more than the total is rejected instead of creating credit', async () => {
  const s = await seed();
  await expect(baseSale(s, { amountPaidCents: 600 })).rejects.toThrow(/between zero and the sale total/);
});

test('underpayment without a customer is rejected', async () => {
  const s = await seed();
  await expect(baseSale(s, { amountPaidCents: 300 })).rejects.toThrow(/credit customer/);
});

test('underpayment with a customer creates a PARTIAL sale reconciling to the unpaid amount', async () => {
  const s = await seed();
  const sale = await baseSale(s, { amountPaidCents: 300, customerId: s.customerId });
  expect(sale.status).toBe('PARTIAL');
  expect(sale.balanceCents).toBe(200);
  const customerBalance = await s.db.getFirstAsync<{ balance_cents: number }>('SELECT COALESCE(SUM(amount_cents),0) AS balance_cents FROM account_entries WHERE owner_id = ? AND customer_id = ?', OWNER, s.customerId);
  expect(customerBalance!.balance_cents).toBe(200);
});

test('fully unpaid sale requires a customer and opens a ledger balance', async () => {
  const s = await seed();
  await expect(baseSale(s, { amountPaidCents: 0 })).rejects.toThrow(/credit customer/);
  const sale = await baseSale(s, { amountPaidCents: 0, customerId: s.customerId });
  expect(sale.status).toBe('CREDIT');
  expect(sale.balanceCents).toBe(500);
});

test('non-integer amounts are rejected at the repository boundary', async () => {
  const s = await seed();
  await expect(baseSale(s, { amountPaidCents: 500.5 })).rejects.toThrow();
});

test('change collected later is a distinct shop liability, separate from customer credit', async () => {
  const s = await seed();
  const sale = await baseSale(s, { amountPaidCents: 500, amountTenderedCents: 600, changeDueCents: 100, customerId: s.customerId });
  expect(sale.changeOwedCents).toBe(100);
  const open = await listChangeOwed(s.db, OWNER, { status: 'OPEN' });
  expect(open).toHaveLength(1);
  expect(open[0].amount_cents).toBe(100);
  expect(await getOpenChangeOwedTotal(s.db, OWNER)).toBe(100);
  // The customer's credit ledger is untouched by the change owed.
  const creditBalance = await s.db.getFirstAsync<{ balance_cents: number }>('SELECT COALESCE(SUM(amount_cents),0) AS balance_cents FROM account_entries WHERE owner_id = ? AND customer_id = ?', OWNER, s.customerId);
  expect(creditBalance!.balance_cents).toBe(0);
});

test('settling change owed marks it returned without corrupting customer credit', async () => {
  const s = await seed();
  await baseSale(s, { amountPaidCents: 500, amountTenderedCents: 600, changeDueCents: 100, customerId: s.customerId });
  const [record] = await listChangeOwed(s.db, OWNER, { status: 'OPEN' });
  await settleChangeOwed(s.db, OWNER, record.id);
  expect(await getOpenChangeOwedTotal(s.db, OWNER)).toBe(0);
  const settled = await listChangeOwed(s.db, OWNER, { status: 'SETTLED' });
  expect(settled).toHaveLength(1);
  expect(settled[0].settled_at).toBeTruthy();
  const creditBalance = await s.db.getFirstAsync<{ balance_cents: number }>('SELECT COALESCE(SUM(amount_cents),0) AS balance_cents FROM account_entries WHERE owner_id = ? AND customer_id = ?', OWNER, s.customerId);
  expect(creditBalance!.balance_cents).toBe(0);
  const ledgerRows = await s.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM payments WHERE owner_id = ?', OWNER);
  expect(ledgerRows!.count).toBe(1); // only the sale payment, no phantom change payment
  await expect(settleChangeOwed(s.db, OWNER, record.id)).rejects.toThrow(/already been returned/);
});

test('change owed requires a customer and cash payment', async () => {
  const s = await seed();
  await expect(baseSale(s, { amountPaidCents: 500, amountTenderedCents: 600, changeDueCents: 100 })).rejects.toThrow(/Choose a customer/);
  await expect(baseSale(s, { amountPaidCents: 500, amountTenderedCents: 600, changeDueCents: 100, customerId: s.customerId, method: 'ECOCASH' as const })).rejects.toThrow(/invalid/i);
});

test('change owed is queued for sync with the sale', async () => {
  const s = await seed();
  await baseSale(s, { amountPaidCents: 500, amountTenderedCents: 600, changeDueCents: 100, customerId: s.customerId });
  const operations = (await s.raw.getAllAsync<{ operation: string }>('SELECT operation FROM sync_outbox WHERE owner_id = ?', OWNER)).map((row) => row.operation);
  expect(operations).toContain('sale.create');
  expect(operations).toContain('change_owed.create');
});
