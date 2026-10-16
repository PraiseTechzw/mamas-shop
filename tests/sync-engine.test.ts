import { openMigratedDatabase } from './helpers/sqlite';

const mockServer = {
  events: [] as Record<string, unknown>[],
  failNextUpsert: false,
  user: { id: 'device-user-1' },
};

jest.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockServer.user ? { user: mockServer.user } : null }, error: null }) },
    rpc: async () => { throw new Error('rpc not available in tests'); },
    from: (_table: string) => {
      const filters: { field: string; value: string }[] = [];
      const gts: { field: string; value: string }[] = [];
      let orCursor: { receivedAt: string; key: string } | null = null;
      let limit = 100;
      const builder = {
        upsert: async (row: Record<string, unknown>, _opts: unknown) => {
          if (mockServer.failNextUpsert) return { error: new Error('server rejected the change') };
          mockServer.events.push({ ...row, received_at: new Date(Date.parse('2026-10-15T00:00:00.000Z') + mockServer.events.length * 1000).toISOString() });
          return { error: null };
        },
        select: () => builder,
        eq: (field: string, value: string) => { filters.push({ field, value }); return builder; },
        gt: (field: string, value: string) => { gts.push({ field, value }); return builder; },
        or: (raw: string) => {
          const match = /received_at\.gt\.([^,]+),and\(received_at\.eq\.[^,]+,idempotency_key\.gt\.([^)]+)\)/.exec(raw);
          if (match) orCursor = { receivedAt: match[1], key: match[2] };
          return builder;
        },
        order: () => builder,
        limit: (n: number) => { limit = n; return builder; },
        then: (resolve: (value: unknown) => void) => {
          let rows = mockServer.events.filter((event) => filters.every((f) => String(event[f.field]) === f.value));
          for (const g of gts) rows = rows.filter((event) => String(event[g.field]) > g.value);
          if (orCursor) rows = rows.filter((event) => String(event.received_at) > orCursor!.receivedAt || (String(event.received_at) === orCursor!.receivedAt && String(event.idempotency_key) > orCursor!.key));
          rows.sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)) || String(a.idempotency_key).localeCompare(String(b.idempotency_key)));
          return Promise.resolve({ data: rows.slice(0, limit), error: null }).then(resolve);
        },
      };
      return builder;
    },
  },
}));

import { retrySyncConflicts, syncOutbox } from '@/services/sync-engine';
import { addProduct } from '@/db/repositories/inventory';
import { ensureOwnerSeller } from '@/db/repositories/sellers';
import { recordSale } from '@/db/repositories/sales';

const OWNER = 'business-owner';

beforeEach(() => {
  mockServer.events = [];
  mockServer.failNextUpsert = false;
});

test('push uploads queued events, clears the outbox, and marks the sale SYNCED', async () => {
  const { db, raw } = await openMigratedDatabase();
  await ensureOwnerSeller(db, OWNER, 'Mama');
  const productId = await addProduct(db, OWNER, { name: 'Maheu', sku: 'MH-1', category: 'Drinks', unit: 'bottle', priceCents: 250, costCents: 150, opening: 10, reorder: 2 });
  const location = await raw.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ?', OWNER);
  await recordSale(db, { items: [{ productId, quantity: 1 }], customerId: null, amountPaidCents: 250, method: 'CASH', createdBy: OWNER, sellerId: OWNER, locationId: location!.id, ownerId: OWNER });
  const before = await raw.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_id = ?', OWNER);
  expect(before!.count).toBeGreaterThan(0);
  const result = await syncOutbox(db, OWNER, true);
  expect(result.synced).toBeGreaterThan(0);
  expect(result.pending).toBe(0);
  expect(mockServer.events.some((event) => event.operation === 'sale.create')).toBe(true);
  const sale = await raw.getFirstAsync<{ sync_state: string }>('SELECT sync_state FROM sales WHERE owner_id = ?', OWNER);
  expect(sale!.sync_state).toBe('SYNCED');
});

test('a rejected upload keeps the event queued with a retry schedule', async () => {
  const { db, raw } = await openMigratedDatabase();
  await addProduct(db, OWNER, { name: 'Bread', sku: 'BR-1', category: 'Bakery', unit: 'loaf', priceCents: 300, costCents: 200, opening: 5, reorder: 1 });
  mockServer.failNextUpsert = true;
  const result = await syncOutbox(db, OWNER, true);
  expect(result.failed).toBeGreaterThan(0);
  const row = await raw.getFirstAsync<{ last_error: string | null; next_attempt_at: string | null; attempt_count: number }>('SELECT last_error, next_attempt_at, attempt_count FROM sync_outbox WHERE owner_id = ? LIMIT 1', OWNER);
  expect(row!.last_error).toContain('server rejected');
  expect(row!.attempt_count).toBe(1);
  expect(row!.next_attempt_at).not.toBeNull();
  mockServer.failNextUpsert = false;
  const second = await syncOutbox(db, OWNER);
  expect(second.synced).toBe(0); // backoff: not due yet, and nothing new uploaded
  expect(second.pending).toBeGreaterThan(0);
});

test('pull materializes a remote customer exactly once', async () => {
  const { db, raw } = await openMigratedDatabase();
  mockServer.events.push({ idempotency_key: 'k-cust', owner_id: OWNER, entity_type: 'customer', entity_id: 'cust-9', operation: 'customer.create', payload: { id: 'cust-9', name: 'Farai', phone: '+263770000009' }, occurred_at: '2026-10-15T05:00:00.000Z', received_at: '2026-10-15T05:00:00.000Z' });
  const first = await syncOutbox(db, OWNER, true);
  expect(first.downloaded).toBe(1);
  const customer = await raw.getFirstAsync<{ name: string }>('SELECT name FROM customers WHERE id = ?', 'cust-9');
  expect(customer!.name).toBe('Farai');
  const second = await syncOutbox(db, OWNER, true);
  expect(second.downloaded).toBe(0);
  const count = await raw.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM customers WHERE owner_id = ?', OWNER);
  expect(count!.count).toBe(1);
});

test('an unusable remote sale becomes a visible conflict and is applied after its dependency arrives', async () => {
  const { db, raw } = await openMigratedDatabase();
  mockServer.events.push({ idempotency_key: 'k-sale-ghost', owner_id: OWNER, entity_type: 'sale', entity_id: 'sale-ghost', operation: 'sale.create', payload: { id: 'sale-ghost', receipt_number: 'MS-G', total_cents: 400, paid_cents: 400, balance_cents: 0, status: 'PAID', items: [{ id: 'si-g', product_id: 'later-product', name: 'Later', quantity: 1, unit_price_cents: 400, line_total_cents: 400, unit_cost_cents: 300 }] }, occurred_at: '2026-10-15T06:00:00.000Z', received_at: '2026-10-15T06:00:00.000Z' });
  const result = await syncOutbox(db, OWNER, true);
  expect(result.conflicts).toBe(1);
  expect(result.downloaded).toBe(0);
  const conflict = await raw.getFirstAsync<{ description: string }>('SELECT description FROM sync_conflicts WHERE owner_id = ?', OWNER);
  expect(conflict!.description).toMatch(/has not arrived/);
  mockServer.events.push({ idempotency_key: 'k-product-later', owner_id: OWNER, entity_type: 'product', entity_id: 'later-product', operation: 'product.create', payload: { id: 'later-product', name: 'Later', price_cents: 400, cost_cents: 300, opening: 4, reorder: 1, location_id: OWNER + ':main' }, occurred_at: '2026-10-15T07:00:00.000Z', received_at: '2026-10-15T07:00:00.000Z' });
  await syncOutbox(db, OWNER, true);
  const resolved = await retrySyncConflicts(db, OWNER);
  expect(resolved).toBe(1);
  const openConflicts = await raw.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_conflicts WHERE owner_id = ? AND resolved_at IS NULL', OWNER);
  expect(openConflicts!.count).toBe(0);
  const sale = await raw.getFirstAsync<{ id: string }>('SELECT id FROM sales WHERE id = ?', 'sale-ghost');
  expect(sale).not.toBeNull();
});

test('sync reports unavailable when signed out', async () => {
  const { db } = await openMigratedDatabase();
  mockServer.user = null as unknown as { id: string };
  const result = await syncOutbox(db, OWNER, true);
  expect(result.unavailable).toBe('signed-out');
  mockServer.user = { id: 'device-user-1' };
});
