import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE products (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku,
        category TEXT NOT NULL DEFAULT 'Other',
        unit TEXT NOT NULL DEFAULT 'each',
        price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
        stock_quantity REAL NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
        reorder_level REAL NOT NULL DEFAULT 0 CHECK(reorder_level >= 0),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX products_active_name_idx ON products(is_active, name);

      CREATE TABLE customers (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX customers_name_idx ON customers(name);

      CREATE TABLE sales (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        receipt_number TEXT NOT NULL UNIQUE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
        paid_cents INTEGER NOT NULL CHECK(paid_cents >= 0),
        balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0),
        status TEXT NOT NULL CHECK(status IN ('PAID', 'PARTIAL', 'CREDIT')),
        created_by TEXT,
        created_at TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'PENDING'
      );
      CREATE INDEX sales_created_at_idx ON sales(created_at DESC);
      CREATE INDEX sales_customer_idx ON sales(customer_id, created_at DESC);

      CREATE TABLE sale_items (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL CHECK(quantity > 0),
        unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
        line_total_cents INTEGER NOT NULL CHECK(line_total_cents >= 0)
      );
      CREATE INDEX sale_items_sale_idx ON sale_items(sale_id);

      CREATE TABLE payments (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        method TEXT NOT NULL CHECK(method IN ('CASH', 'ECOCASH', 'CARD', 'OTHER')),
        kind TEXT NOT NULL CHECK(kind IN ('SALE', 'REPAYMENT')),
        note TEXT,
        created_at TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'PENDING'
      );
      CREATE INDEX payments_created_at_idx ON payments(created_at DESC);

      CREATE TABLE account_entries (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
        payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
        entry_type TEXT NOT NULL CHECK(entry_type IN ('SALE_CHARGE', 'PAYMENT')),
        amount_cents INTEGER NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX account_entries_customer_date_idx ON account_entries(customer_id, created_at DESC);

      CREATE TABLE sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX sync_outbox_created_at_idx ON sync_outbox(created_at);
    `);
    version = 1;
  }

  await db.execAsync('PRAGMA user_version = ' + DATABASE_VERSION);
}
