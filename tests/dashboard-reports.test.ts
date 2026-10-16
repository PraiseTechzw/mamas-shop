import { openMigratedDatabase } from './helpers/sqlite';
import { addProduct } from '@/db/repositories/inventory';
import { createCustomer } from '@/db/repositories/customers';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { recordSale } from '@/db/repositories/sales';
import { getDashboardData } from '@/db/repositories/dashboard';
import { getReportSummary } from '@/db/repositories/reports';

const OWNER = 'owner-1';

function localDay(offsetDays: number, hour = 12) {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hour, 0, 0);
  return day;
}

test('dashboard counts only today and keeps change owed separate from credit', async () => {
  const { db, raw } = await openMigratedDatabase();
  await ensureOwnerSeller(db, OWNER, 'Mama');
  const productId = await addProduct(db, OWNER, { name: 'Maheu', sku: 'MH-1', category: 'Drinks', unit: 'bottle', priceCents: 250, costCents: 150, opening: 20, reorder: 2 });
  const location = await raw.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ?', OWNER);
  const customerId = await createCustomer(db, OWNER, 'Neighbour', '');

  // Yesterday: a credit sale (should not appear in today's figures).
  await recordSale(db, { items: [{ productId, quantity: 4 }], customerId, amountPaidCents: 0, method: 'CASH', createdBy: OWNER, sellerId: OWNER, locationId: location!.id, ownerId: OWNER });
  const yesterday = localDay(-1, 9).toISOString();
  await raw.runAsync('UPDATE sales SET created_at = ? WHERE owner_id = ?', yesterday, OWNER);
  await raw.runAsync('UPDATE account_entries SET created_at = ? WHERE owner_id = ?', yesterday, OWNER);

  // Today: a cash sale with 100 change owed for collection later.
  await recordSale(db, { items: [{ productId, quantity: 2 }], customerId, amountPaidCents: 500, amountTenderedCents: 600, changeDueCents: 100, method: 'CASH', createdBy: OWNER, sellerId: OWNER, locationId: location!.id, ownerId: OWNER });

  const data = await getDashboardData(db, OWNER);
  expect(data.salesTodayCents).toBe(500);
  expect(data.salesTodayCount).toBe(1);
  expect(data.changeOwedOpenCents).toBe(100);
  expect(data.creditOutstandingCents).toBe(1000); // yesterday's unpaid sale only
  expect(data.salesBySeller.every((row) => row.saleCount === 1)).toBe(true);
});

test('report boundaries use inclusive start and exclusive end and reconcile profit', async () => {
  const { db, raw } = await openMigratedDatabase();
  await ensureOwnerSeller(db, OWNER, 'Mama');
  const productId = await addProduct(db, OWNER, { name: 'Oil', sku: 'OIL-1', category: 'Grocery', unit: 'litre', priceCents: 1000, costCents: 600, opening: 10, reorder: 2 });
  const location = await raw.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ?', OWNER);
  const customerId = await createCustomer(db, OWNER, 'Wanice', '');
  const start = localDay(0, 0);
  const end = localDay(1, 0);
  await recordSale(db, { items: [{ productId, quantity: 3 }], customerId, amountPaidCents: 2500, method: 'CASH', createdBy: OWNER, sellerId: OWNER, locationId: location!.id, ownerId: OWNER });
  await raw.runAsync('UPDATE sales SET created_at = ? WHERE owner_id = ?', localDay(2, 10).toISOString(), OWNER); // out of range
  const summary = await getReportSummary(db, OWNER, start.toISOString(), end.toISOString());
  expect(summary.count).toBe(0); // the only sale moved outside the window
  await raw.runAsync('UPDATE sales SET created_at = ? WHERE owner_id = ?', localDay(0, 15).toISOString(), OWNER);
  await raw.runAsync("INSERT INTO expenses (id, owner_id, title, category, amount_cents, payment_method, spent_at, created_at) VALUES ('exp-1', ?, 'Rent', 'Rent', 500, 'CASH', ?, ?)", OWNER, localDay(0, 8).toISOString(), localDay(0, 8).toISOString());
  const inRange = await getReportSummary(db, OWNER, start.toISOString(), end.toISOString());
  expect(inRange.count).toBe(1);
  expect(inRange.sales).toBe(3000);
  expect(inRange.received).toBe(2500);
  expect(inRange.credit).toBe(500);
  expect(inRange.cost).toBe(1800);
  expect(inRange.expenses).toBe(500);
  expect(inRange.profit).toBe(3000 - 1800 - 500);
});
