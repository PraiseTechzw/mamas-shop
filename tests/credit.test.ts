import { openMigratedDatabase } from './helpers/sqlite';
import { addProduct } from '@/db/repositories/inventory';
import { createCustomer, getCustomer } from '@/db/repositories/customers';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { recordRepayment, recordSale } from '@/db/repositories/sales';

const OWNER = 'owner-1';

async function seedCredit() {
  const { db, raw } = await openMigratedDatabase();
  await ensureOwnerSeller(db, OWNER, 'Mama');
  const productId = await addProduct(db, OWNER, { name: 'Biscuits', sku: 'BS-1', category: 'Snacks', unit: 'pack', priceCents: 400, costCents: 250, opening: 10, reorder: 2 });
  const location = await raw.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ?', OWNER);
  const customerId = await createCustomer(db, OWNER, 'Morelife', '+263770000002');
  await recordSale(db, { items: [{ productId, quantity: 5 }], customerId, amountPaidCents: 0, method: 'CASH', createdBy: OWNER, sellerId: OWNER, locationId: location!.id, ownerId: OWNER });
  return { db, raw, customerId };
}

test('credit sale opens the ledger at the full total', async () => {
  const { db, customerId } = await seedCredit();
  const customer = await getCustomer(db, OWNER, customerId);
  expect(customer!.balance_cents).toBe(2000);
});

test('repayment reduces the balance and reconciles the ledger to zero', async () => {
  const { db, raw, customerId } = await seedCredit();
  await recordRepayment(db, OWNER, customerId, 1200, 'CASH', 'Part payment');
  expect((await getCustomer(db, OWNER, customerId))!.balance_cents).toBe(800);
  await recordRepayment(db, OWNER, customerId, 800, 'ECOCASH', '');
  const customer = await getCustomer(db, OWNER, customerId);
  expect(customer!.balance_cents).toBe(0);
  const check = await raw.getFirstAsync<{ balance_cents: number }>('SELECT COALESCE(SUM(amount_cents),0) AS balance_cents FROM account_entries WHERE customer_id = ? AND owner_id = ?', customerId, OWNER);
  expect(check!.balance_cents).toBe(0);
});

test('repaying more than the outstanding balance is rejected', async () => {
  const { db, customerId } = await seedCredit();
  await expect(recordRepayment(db, OWNER, customerId, 2001, 'CASH', '')).rejects.toThrow(/greater than the outstanding balance/);
});

test('repayment requires a positive whole amount', async () => {
  const { db, customerId } = await seedCredit();
  await expect(recordRepayment(db, OWNER, customerId, 0, 'CASH', '')).rejects.toThrow(/greater than zero/);
  await expect(recordRepayment(db, OWNER, customerId, 50.5, 'CASH', '')).rejects.toThrow(/greater than zero/);
});

test('repayments queue a sync event and audit entry', async () => {
  const { db, raw, customerId } = await seedCredit();
  await recordRepayment(db, OWNER, customerId, 500, 'CASH', 'Week one');
  const operations = (await raw.getAllAsync<{ operation: string }>('SELECT operation FROM sync_outbox WHERE owner_id = ? ORDER BY created_at', OWNER)).map((r) => r.operation);
  expect(operations).toContain('credit.repayment.create');
  const audits = await raw.getAllAsync<{ action: string }>("SELECT action FROM audit_log WHERE owner_id = ? AND entity_type = 'payment'", OWNER);
  expect(audits).toHaveLength(1);
});
