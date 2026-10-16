import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 9;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE products (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, sku TEXT, category TEXT NOT NULL DEFAULT 'Other', unit TEXT NOT NULL DEFAULT 'each', price_cents INTEGER NOT NULL CHECK(price_cents >= 0), stock_quantity REAL NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0), reorder_level REAL NOT NULL DEFAULT 0 CHECK(reorder_level >= 0), is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX products_active_name_idx ON products(is_active, name);
      CREATE TABLE customers (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX customers_name_idx ON customers(name);
      CREATE TABLE sales (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, receipt_number TEXT NOT NULL UNIQUE, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL, total_cents INTEGER NOT NULL CHECK(total_cents >= 0), paid_cents INTEGER NOT NULL CHECK(paid_cents >= 0), balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0), status TEXT NOT NULL CHECK(status IN ('PAID', 'PARTIAL', 'CREDIT')), created_by TEXT, created_at TEXT NOT NULL, sync_state TEXT NOT NULL DEFAULT 'PENDING');
      CREATE INDEX sales_created_at_idx ON sales(created_at DESC); CREATE INDEX sales_customer_idx ON sales(customer_id, created_at DESC);
      CREATE TABLE sale_items (id TEXT PRIMARY KEY NOT NULL, sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE, product_id TEXT REFERENCES products(id) ON DELETE SET NULL, product_name TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity > 0), unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0), line_total_cents INTEGER NOT NULL CHECK(line_total_cents >= 0)); CREATE INDEX sale_items_sale_idx ON sale_items(sale_id);
      CREATE TABLE payments (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL, sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), method TEXT NOT NULL CHECK(method IN ('CASH', 'ECOCASH', 'CARD', 'OTHER')), kind TEXT NOT NULL CHECK(kind IN ('SALE', 'REPAYMENT')), note TEXT, created_at TEXT NOT NULL, sync_state TEXT NOT NULL DEFAULT 'PENDING'); CREATE INDEX payments_created_at_idx ON payments(created_at DESC);
      CREATE TABLE account_entries (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL, payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL, entry_type TEXT NOT NULL CHECK(entry_type IN ('SALE_CHARGE', 'PAYMENT')), amount_cents INTEGER NOT NULL, note TEXT, created_at TEXT NOT NULL); CREATE INDEX account_entries_customer_date_idx ON account_entries(customer_id, created_at DESC);
      CREATE TABLE sync_outbox (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT); CREATE INDEX sync_outbox_created_at_idx ON sync_outbox(created_at);
    `);
    version = 1;
  }
  if (version < 2) {
    const productColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(products)');
    if (!productColumns.some((column) => column.name === 'cost_cents')) await db.execAsync('ALTER TABLE products ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(cost_cents >= 0)');
    const saleColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sale_items)');
    if (!saleColumns.some((column) => column.name === 'unit_cost_cents')) await db.execAsync('ALTER TABLE sale_items ADD COLUMN unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_cents >= 0)');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS inventory_locations (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(owner_id, name));
      CREATE TABLE IF NOT EXISTS inventory_balances (owner_id TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, location_id TEXT NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE, quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0), updated_at TEXT NOT NULL, PRIMARY KEY(product_id, location_id));
      CREATE INDEX IF NOT EXISTS inventory_balances_location_idx ON inventory_balances(owner_id, location_id);
      CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id), movement_type TEXT NOT NULL CHECK(movement_type IN ('OPENING', 'RECEIVE', 'ADJUST', 'TRANSFER', 'SALE')), quantity REAL NOT NULL, from_location_id TEXT REFERENCES inventory_locations(id), to_location_id TEXT REFERENCES inventory_locations(id), unit_cost_cents INTEGER NOT NULL DEFAULT 0, note TEXT, created_at TEXT NOT NULL, sync_state TEXT NOT NULL DEFAULT 'PENDING');
      CREATE INDEX IF NOT EXISTS stock_movements_product_date_idx ON stock_movements(owner_id, product_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS stock_movements_date_idx ON stock_movements(owner_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'ECOCASH', 'CARD', 'OTHER')), note TEXT, spent_at TEXT NOT NULL, created_at TEXT NOT NULL, sync_state TEXT NOT NULL DEFAULT 'PENDING');
      CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(owner_id, spent_at DESC);
      CREATE TABLE IF NOT EXISTS shop_settings (owner_id TEXT PRIMARY KEY NOT NULL, shop_name TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT 'USD', low_stock_alerts INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, description TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_log_date_idx ON audit_log(owner_id, created_at DESC);
    `);
    version = 2;
  }
  if (version < 3) {
    const outboxColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sync_outbox)');
    if (!outboxColumns.some((column) => column.name === 'next_attempt_at')) await db.execAsync('ALTER TABLE sync_outbox ADD COLUMN next_attempt_at TEXT');
    await db.execAsync('CREATE INDEX IF NOT EXISTS sync_outbox_owner_created_idx ON sync_outbox(owner_id, created_at);');
    await db.execAsync('CREATE TABLE IF NOT EXISTS sync_metadata (owner_id TEXT PRIMARY KEY NOT NULL, last_synced_at TEXT);');
    version = 3;
  }
  if (version < 4) {
    const productColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(products)');
    if (!productColumns.some((column) => column.name === 'image_uri')) await db.execAsync('ALTER TABLE products ADD COLUMN image_uri TEXT');
    version = 4;
  }
  if (version < 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sellers (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        is_owner INTEGER NOT NULL DEFAULT 0 CHECK(is_owner IN (0, 1)),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(owner_id, name)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS sellers_one_owner_idx ON sellers(owner_id) WHERE is_owner = 1;
      CREATE INDEX IF NOT EXISTS sellers_active_name_idx ON sellers(owner_id, is_active, name);
    `);
    const saleColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sales)');
    if (!saleColumns.some((column) => column.name === 'seller_id')) await db.execAsync('ALTER TABLE sales ADD COLUMN seller_id TEXT REFERENCES sellers(id) ON DELETE SET NULL');
    if (!saleColumns.some((column) => column.name === 'location_id')) await db.execAsync('ALTER TABLE sales ADD COLUMN location_id TEXT REFERENCES inventory_locations(id) ON DELETE SET NULL');
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS sales_seller_date_idx ON sales(owner_id, seller_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS sales_location_date_idx ON sales(owner_id, location_id, created_at DESC);
      INSERT OR IGNORE INTO sellers (id, owner_id, name, is_owner, is_active, created_at, updated_at)
        SELECT owner_id, owner_id, 'Shop owner', 1, 1, MIN(created_at), MIN(created_at) FROM sales GROUP BY owner_id;
      UPDATE sales SET seller_id = owner_id WHERE seller_id IS NULL AND EXISTS (SELECT 1 FROM sellers WHERE sellers.id = sales.owner_id);
      UPDATE sales SET location_id = (SELECT id FROM inventory_locations WHERE inventory_locations.owner_id = sales.owner_id ORDER BY is_primary DESC, created_at LIMIT 1) WHERE location_id IS NULL;
    `);
    version = 5;
  }
  if (version < 6) {
    const syncMetadataColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sync_metadata)');
    if (!syncMetadataColumns.some((column) => column.name === 'last_pulled_at')) await db.execAsync('ALTER TABLE sync_metadata ADD COLUMN last_pulled_at TEXT');
    if (!syncMetadataColumns.some((column) => column.name === 'last_pulled_key')) await db.execAsync('ALTER TABLE sync_metadata ADD COLUMN last_pulled_key TEXT');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_applied_events (
        idempotency_key TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        idempotency_key TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS sync_conflicts_owner_date_idx ON sync_conflicts(owner_id, created_at DESC);
      INSERT OR IGNORE INTO sync_applied_events (idempotency_key, owner_id, applied_at)
        SELECT idempotency_key, owner_id, created_at FROM sync_outbox;
    `);
    version = 6;
  }
  if (version < 7) {
    const conflictColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sync_conflicts)');
    if (!conflictColumns.some((column) => column.name === 'payload_json')) await db.execAsync("ALTER TABLE sync_conflicts ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'");
    version = 7;
  }
  if (version < 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS business_scopes (
        user_id TEXT PRIMARY KEY NOT NULL,
        business_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    version = 8;
  }
  if (version < 9) {
    // Change the shop owes a customer (collected later) is money held on trust,
    // not customer credit, so it lives in its own immutable-once ledger.
    const saleColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sales)');
    if (!saleColumns.some((column) => column.name === 'amount_tendered_cents')) await db.execAsync('ALTER TABLE sales ADD COLUMN amount_tendered_cents INTEGER');
    if (!saleColumns.some((column) => column.name === 'change_due_cents')) await db.execAsync('ALTER TABLE sales ADD COLUMN change_due_cents INTEGER NOT NULL DEFAULT 0');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS change_owed (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        sale_id TEXT,
        receipt_number TEXT,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'SETTLED')),
        created_at TEXT NOT NULL,
        settled_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'PENDING'
      );
      CREATE INDEX IF NOT EXISTS change_owed_owner_status_idx ON change_owed(owner_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS change_owed_customer_idx ON change_owed(customer_id, status);
    `);
    version = 9;
  }
  await db.execAsync('PRAGMA user_version = ' + Math.min(version, DATABASE_VERSION));
}
