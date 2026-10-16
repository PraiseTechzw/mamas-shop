import { openMigratedDatabase } from './helpers/sqlite';
import { joinBusiness } from '@/services/business-membership';
import { addProduct } from '@/db/repositories/inventory';
import { createCustomer } from '@/db/repositories/customers';

const STAFF = 'staff-1';

jest.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'device-user-1' } } }, error: null }) }, rpc: async () => { throw new Error('unreachable in these guards'); }, from: () => ({ upsert: async () => ({ error: null }) }) },
}));

test('a staff login that already owns shop records cannot hijack another business', async () => {
  const { db } = await openMigratedDatabase();
  await addProduct(db, STAFF, { name: 'Own Product', sku: 'OWN-1', category: 'Other', unit: 'each', priceCents: 100, costCents: 50, opening: 1, reorder: 0 });
  await expect(joinBusiness(db, STAFF, 'a'.repeat(40))).rejects.toThrow(/already has shop records/);
});

test('a short or malformed invitation code is rejected before any network call', async () => {
  const { db } = await openMigratedDatabase();
  await expect(joinBusiness(db, STAFF, 'short-code')).rejects.toThrow(/full invitation code/);
});

test('pending local changes must be synced before joining a business', async () => {
  const { db } = await openMigratedDatabase();
  // A clean login has no records, but create a pending outbox entry to simulate unsynced local work.
  await createCustomer(db, STAFF, 'Draft Customer', '');
  await db.runAsync('DELETE FROM customers WHERE owner_id = ?', STAFF);
  await expect(joinBusiness(db, STAFF, 'b'.repeat(40))).rejects.toThrow(/pending changes/);
});
