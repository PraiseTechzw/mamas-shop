import { openMigratedDatabase } from './helpers/sqlite';
import { addProduct } from '@/db/repositories/inventory';
import { recordSale } from '@/db/repositories/sales';
import { ensureOwnerSeller } from '@/db/repositories/sellers';

const OWNER = 'owner-1';

async function seed() {
  const { db, raw } = await openMigratedDatabase();
  await ensureOwnerSeller(db, OWNER, 'Mama');
  const productId = await addProduct(db, OWNER, { name: 'Maheu', sku: 'MH-1', category: 'Drinks', unit: 'bottle', priceCents: 250, costCents: 150, opening: 10, reorder: 2 });
  const location = await raw.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ?', OWNER);
  return { db, raw, productId, locationId: location!.id };
}

test('records an exact cash sale with atomic stock and outbox writes', async () => {
  const { db, raw, productId, locationId } = await seed();
  const sale = await recordSale(db, { items: [{ productId, quantity: 2 }], customerId: null, amountPaidCents: 500, amountTenderedCents: 500, method: 'CASH', createdBy: OWNER, sellerId: OWNER, locationId, ownerId: OWNER });
  expect(sale.status).toBe('PAID');
  const product = await raw.getFirstAsync<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', productId);
  expect(product!.stock_quantity).toBe(8);
  const balance = await raw.getFirstAsync<{ quantity: number }>('SELECT quantity FROM inventory_balances WHERE product_id = ?', productId);
  expect(balance!.quantity).toBe(8);
  const outbox = await raw.getAllAsync<{ operation: string }>('SELECT operation FROM sync_outbox WHERE owner_id = ?', OWNER);
  expect(outbox.map((row) => row.operation)).toContain('sale.create');
  const movements = await raw.getAllAsync<{ movement_type: string }>('SELECT movement_type FROM stock_movements WHERE product_id = ?', productId);
  expect(movements.map((m) => m.movement_type)).toEqual(expect.arrayContaining(['OPENING', 'SALE']));
});
