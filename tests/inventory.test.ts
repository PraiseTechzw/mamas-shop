import { openMigratedDatabase } from './helpers/sqlite';
import { addLocation, addProduct, adjustStock, getLocationBalance, listMovements, receiveStock, transferStock } from '@/db/repositories/inventory';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { recordSale } from '@/db/repositories/sales';

const OWNER = 'owner-1';

async function seed() {
  const { db, raw } = await openMigratedDatabase();
  const productId = await addProduct(db, OWNER, { name: 'Mealie Meal', sku: 'MM-1', category: 'Grains', unit: 'bag', priceCents: 900, costCents: 700, opening: 5, reorder: 2 });
  const primary = await raw.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ? AND is_primary = 1', OWNER);
  const branchId = await addLocation(db, OWNER, 'Kiosk');
  return { db, raw, productId, primaryId: primary!.id, branchId };
}

test('receive adds to location and global stock and records cost', async () => {
  const { db, productId, primaryId } = await seed();
  await receiveStock(db, OWNER, productId, 7, 650, 'Supplier delivery', primaryId);
  expect(await getLocationBalance(db, OWNER, productId, primaryId)).toBe(12);
  const product = await db.getFirstAsync<{ stock_quantity: number; cost_cents: number }>('SELECT stock_quantity, cost_cents FROM products WHERE id = ?', productId);
  expect(product!.stock_quantity).toBe(12);
  expect(product!.cost_cents).toBe(650);
  const types = (await listMovements(db, OWNER, productId)).map((m) => m.movement_type);
  expect(types).toContain('RECEIVE');
});

test('stock count adjustment requires a reason and moves the balance to the count', async () => {
  const { db, productId, primaryId } = await seed();
  await expect(adjustStock(db, OWNER, productId, 3, '  ', primaryId)).rejects.toThrow(/reason/);
  await adjustStock(db, OWNER, productId, 3, 'Damaged bags thrown away', primaryId);
  expect(await getLocationBalance(db, OWNER, productId, primaryId)).toBe(3);
  const movement = (await listMovements(db, OWNER, productId)).find((m) => m.movement_type === 'ADJUST');
  expect(movement!.quantity).toBe(-2);
  expect(movement!.note).toContain('Damaged');
});

test('transfer moves stock between locations and refuses more than available', async () => {
  const { db, productId, primaryId, branchId } = await seed();
  await transferStock(db, OWNER, productId, 2, primaryId, branchId, 'Restock kiosk');
  expect(await getLocationBalance(db, OWNER, productId, primaryId)).toBe(3);
  expect(await getLocationBalance(db, OWNER, productId, branchId)).toBe(2);
  await expect(transferStock(db, OWNER, productId, 10, primaryId, branchId, '')).rejects.toThrow(/not enough stock/);
  const product = await db.getFirstAsync<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', productId);
  expect(product!.stock_quantity).toBe(5); // transfers do not change the global total
});

test('every stock change queues an outbox event', async () => {
  const { db, raw, productId, primaryId, branchId } = await seed();
  await receiveStock(db, OWNER, productId, 4, 680, '', primaryId);
  await adjustStock(db, OWNER, productId, 20, 'Found missing bags', primaryId);
  await transferStock(db, OWNER, productId, 1, primaryId, branchId, '');
  const operations = (await raw.getAllAsync<{ operation: string }>('SELECT operation FROM sync_outbox WHERE owner_id = ? ORDER BY created_at', OWNER)).map((r) => r.operation);
  expect(operations).toEqual(expect.arrayContaining(['stock.receive', 'stock.adjust', 'stock.transfer']));
});

test('sales cannot take a location balance negative', async () => {
  const { db, raw, productId, primaryId, branchId } = await seed();
  await transferStock(db, OWNER, productId, 5, primaryId, branchId, '');
  await ensureOwnerSeller(db, OWNER, 'Mama');
  await expect(recordSale(db, { items: [{ productId, quantity: 2 }], customerId: null, amountPaidCents: 0, method: 'CASH' as const, createdBy: OWNER, sellerId: OWNER, locationId: primaryId, ownerId: OWNER })).rejects.toThrow(/not enough/i);
  const balance = await getLocationBalance(db, OWNER, productId, primaryId);
  expect(balance).toBe(0);
  const saleCount = await raw.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sales WHERE owner_id = ?', OWNER);
  expect(saleCount!.count).toBe(0);
});
