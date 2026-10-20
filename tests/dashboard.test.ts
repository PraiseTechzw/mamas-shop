import { openMigratedDatabase } from './helpers/sqlite';
import { addProduct } from '@/db/repositories/inventory';
import { createCustomer } from '@/db/repositories/customers';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { recordSale } from '@/db/repositories/sales';
import { getDailyPaymentBreakdown, getDashboardData } from '@/db/repositories/dashboard';

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
  expect(await getDailyPaymentBreakdown(db, OWNER)).toEqual({
    CASH: 500,
    ECOCASH: 0,
    CARD: 0,
    OTHER: 0,
  });
});
