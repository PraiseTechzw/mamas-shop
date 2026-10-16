import type { SQLiteDatabase } from 'expo-sqlite';
import { openMigratedDatabase } from './helpers/sqlite';
import { addProduct } from '@/db/repositories/inventory';
import { applyRemoteEvent, type RemoteSyncEvent } from '@/services/apply-remote-event';

const OWNER = 'owner-1';

function event(operation: string, entity: string, id: string, payload: unknown, occurredAt = '2026-10-15T09:00:00.000Z'): RemoteSyncEvent {
  return { idempotency_key: 'evt-' + operation + '-' + id, owner_id: OWNER, entity_type: entity, entity_id: id, operation, payload, occurred_at: occurredAt, received_at: occurredAt };
}

async function seededProduct(db: SQLiteDatabase): Promise<{ productId: string; locationId: string }> {
  const productId = await addProduct(db, OWNER, { name: 'Cooking Oil', sku: 'CO-1', category: 'Grocery', unit: 'litre', priceCents: 1500, costCents: 1200, opening: 10, reorder: 3 });
  const location = await db.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ? AND is_primary = 1', OWNER);
  return { productId, locationId: location!.id };
}

test('remote product create materializes once; replay does not duplicate stock', async () => {
  const { db } = await openMigratedDatabase();
  const evt = event('product.create', 'product', 'p-1', { id: 'p-1', name: 'Sugar', price_cents: 800, cost_cents: 600, opening: 10, reorder: 2, location_id: OWNER + ':main', updated_at: '2026-10-14T08:00:00.000Z' });
  await applyRemoteEvent(db, evt);
  await applyRemoteEvent(db, evt);
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM products WHERE owner_id = ?', OWNER);
  expect(count!.count).toBe(1);
  const product = await db.getFirstAsync<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', 'p-1');
  expect(product!.stock_quantity).toBe(10);
});

test('remote sale applies stock, items, and sync state; replay is a no-op', async () => {
  const { db, raw } = await openMigratedDatabase();
  const { productId, locationId } = await seededProduct(db);
  const evt = event('sale.create', 'sale', 'sale-1', {
    id: 'sale-1', receipt_number: 'MS-REMOTE-1', total_cents: 3000, paid_cents: 3000, balance_cents: 0, status: 'PAID', payment_method: 'CASH',
    location_id: locationId, seller_id: OWNER,
    items: [{ id: 'si-1', product_id: productId, name: 'Cooking Oil', quantity: 2, unit_price_cents: 1500, line_total_cents: 3000, unit_cost_cents: 1200 }],
  });
  await applyRemoteEvent(db, evt);
  const product = await db.getFirstAsync<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', productId);
  expect(product!.stock_quantity).toBe(8);
  const sale = await db.getFirstAsync<{ sync_state: string }>('SELECT sync_state FROM sales WHERE id = ?', 'sale-1');
  expect(sale!.sync_state).toBe('SYNCED');
  const payments = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM payments WHERE sale_id = ?', 'sale-1');
  expect(payments!.count).toBe(1);
  await applyRemoteEvent(db, evt);
  const afterReplay = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sales WHERE owner_id = ?', OWNER);
  expect(afterReplay!.count).toBe(1);
  const stockAfterReplay = await db.getFirstAsync<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', productId);
  expect(stockAfterReplay!.stock_quantity).toBe(8);
  const audits = await raw.getAllAsync<{ description: string }>('SELECT description FROM audit_log WHERE owner_id = ? AND entity_type = ?', OWNER, 'sale');
  void audits;
});

test('inbound sale with a missing product is rejected so it stays a visible conflict', async () => {
  const { db } = await openMigratedDatabase();
  const evt = event('sale.create', 'sale', 'sale-2', {
    id: 'sale-2', receipt_number: 'MS-REMOTE-2', total_cents: 500, paid_cents: 500, balance_cents: 0, status: 'PAID',
    items: [{ id: 'si-2', product_id: 'ghost-product', name: 'Ghost', quantity: 1, unit_price_cents: 500, line_total_cents: 500, unit_cost_cents: 0 }],
  });
  await expect(applyRemoteEvent(db, evt)).rejects.toThrow(/has not arrived/);
});

test('inbound stock adjust that would make location stock negative is rejected', async () => {
  const { db } = await openMigratedDatabase();
  const { productId } = await seededProduct(db);
  const evt = event('stock.adjust', 'stock_movement', 'adj-1', { id: 'adj-1', product_id: productId, delta: -50, location_id: OWNER + ':main', note: 'Wrong count', created_at: '2026-10-15T10:00:00.000Z' });
  await expect(applyRemoteEvent(db, evt)).rejects.toThrow(/negative/i);
});

test('remote change owed is created with the sale and settled by its own event', async () => {
  const { db } = await openMigratedDatabase();
  const { productId, locationId } = await seededProduct(db);
  await applyRemoteEvent(db, event('customer.create', 'customer', 'cust-1', { id: 'cust-1', name: 'Rutendo', phone: null, created_at: '2026-10-14T07:00:00.000Z' }));
  await applyRemoteEvent(db, event('sale.create', 'sale', 'sale-3', {
    id: 'sale-3', receipt_number: 'MS-REMOTE-3', customer_id: 'cust-1', total_cents: 1500, paid_cents: 1500, balance_cents: 0, status: 'PAID', payment_method: 'CASH',
    location_id: locationId, seller_id: OWNER, change_owed_id: 'change-3', change_due_cents: 500, amount_tendered_cents: 2000,
    items: [{ id: 'si-3', product_id: productId, name: 'Cooking Oil', quantity: 1, unit_price_cents: 1500, line_total_cents: 1500, unit_cost_cents: 1200 }],
  }));
  const open = await db.getFirstAsync<{ amount_cents: number }>("SELECT amount_cents FROM change_owed WHERE id = 'change-3'");
  expect(open!.amount_cents).toBe(500);
  const customerCredit = await db.getFirstAsync<{ balance_cents: number }>('SELECT COALESCE(SUM(amount_cents),0) AS balance_cents FROM account_entries WHERE customer_id = ?', 'cust-1');
  expect(customerCredit!.balance_cents).toBe(0);
  await applyRemoteEvent(db, event('change_owed.settle', 'change_owed', 'change-3', { id: 'change-3', settled_at: '2026-10-15T11:00:00.000Z' }, '2026-10-15T11:00:00.000Z'));
  const settled = await db.getFirstAsync<{ status: string }>("SELECT status FROM change_owed WHERE id = 'change-3'");
  expect(settled!.status).toBe('SETTLED');
});

test('settings updates follow last-write-wins by timestamp', async () => {
  const { db } = await openMigratedDatabase();
  await applyRemoteEvent(db, event('settings.update', 'shop_settings', OWNER, { shop_name: 'Mama’s Corner', currency: 'USD', low_stock_alerts: true, updated_at: '2026-10-15T09:00:00.000Z' }));
  await applyRemoteEvent(db, event('settings.update', 'shop_settings', OWNER, { shop_name: 'Old name', currency: 'ZWL', low_stock_alerts: false, updated_at: '2026-10-14T09:00:00.000Z' }, '2026-10-14T09:00:00.000Z'));
  const settings = await db.getFirstAsync<{ shop_name: string; currency: string }>('SELECT shop_name, currency FROM shop_settings WHERE owner_id = ?', OWNER);
  expect(settings!.shop_name).toBe('Mama’s Corner');
  expect(settings!.currency).toBe('USD');
});

test('unsupported operations fail loudly instead of being discarded', async () => {
  const { db } = await openMigratedDatabase();
  await expect(applyRemoteEvent(db, event('mystery.operation', 'thing', 'x-1', {}))).rejects.toThrow(/Unsupported/);
});
