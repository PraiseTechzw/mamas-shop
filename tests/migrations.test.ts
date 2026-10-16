import { openMigratedDatabase, readVersion } from './helpers/sqlite';
import { migrateDbIfNeeded } from '@/db/migrations';
import { DATABASE_VERSION } from '@/db/migrations';
import { addProduct } from '@/db/repositories/inventory';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { recordSale } from '@/db/repositories/sales';

const OWNER = 'owner-1';

test('migrations land on the current schema version', async () => {
  const { raw } = await openMigratedDatabase();
  expect(await readVersion(raw)).toBe(DATABASE_VERSION);
});

test('an older database is upgraded in place with the change-owed table restored', async () => {
  const { db, raw } = await openMigratedDatabase();
  await raw.execAsync('DROP TABLE change_owed');
  await raw.runAsync('PRAGMA user_version = 8');
  await migrateDbIfNeeded(db);
  expect(await readVersion(raw)).toBe(DATABASE_VERSION);
  const table = await raw.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'change_owed'");
  expect(table).not.toBeNull();
  const columns = await raw.getAllAsync<{ name: string }>('PRAGMA table_info(sales)');
  expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(['amount_tendered_cents', 'change_due_cents']));
});

test('a failed sale transaction leaves no partial sale, ledger, stock, or outbox writes', async () => {
  const { db, raw } = await openMigratedDatabase();
  await ensureOwnerSeller(db, OWNER, 'Mama');
  const good = await addProduct(db, OWNER, { name: 'Maheu', sku: 'MH-1', category: 'Drinks', unit: 'bottle', priceCents: 250, costCents: 150, opening: 10, reorder: 2 });
  const tight = await addProduct(db, OWNER, { name: 'Bean', sku: 'BN-1', category: 'Grocery', unit: 'kg', priceCents: 900, costCents: 800, opening: 1, reorder: 0 });
  const location = await raw.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ?', OWNER);
  const outboxBefore = (await raw.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_id = ?', OWNER))!.count;
  await expect(recordSale(db, { items: [{ productId: good, quantity: 2 }, { productId: tight, quantity: 5 }], customerId: null, amountPaidCents: 0, method: 'CASH', createdBy: OWNER, sellerId: OWNER, locationId: location!.id, ownerId: OWNER })).rejects.toThrow();
  const saleCount = (await raw.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sales WHERE owner_id = ?', OWNER))!.count;
  expect(saleCount).toBe(0);
  const stock = (await raw.getFirstAsync<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', good))!.stock_quantity;
  expect(stock).toBe(10);
  const outboxAfter = (await raw.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_id = ?', OWNER))!.count;
  expect(outboxAfter).toBe(outboxBefore);
  const auditCount = await raw.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM audit_log WHERE owner_id = ? AND entity_type = 'sale'", OWNER);
  expect(auditCount!.count).toBe(0);
});
