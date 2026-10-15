import type { SQLiteDatabase } from 'expo-sqlite';

export type RemoteSyncEvent = {
  idempotency_key: string;
  owner_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload: unknown;
  occurred_at: string;
  received_at: string;
};

type Payload = Record<string, unknown>;
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const int = (value: unknown, fallback = 0) => Math.round(number(value, fallback));
const object = (value: unknown): Payload => value && typeof value === 'object' && !Array.isArray(value) ? value as Payload : {};
const either = (payload: Payload, camel: string, snake: string) => payload[camel] ?? payload[snake];

async function ensureLocation(db: SQLiteDatabase, ownerId: string, id: string, name = 'Shop location', primary = false, at = new Date().toISOString()) {
  if (!id) throw new Error('This event refers to a missing stock location.');
  await db.runAsync('INSERT INTO inventory_locations (id, owner_id, name, is_primary, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = CASE WHEN inventory_locations.name = \'Shop location\' THEN excluded.name ELSE inventory_locations.name END, is_primary = MAX(inventory_locations.is_primary, excluded.is_primary)', id, ownerId, name, primary ? 1 : 0, at);
}

async function applyProduct(db: SQLiteDatabase, event: RemoteSyncEvent, payload: Payload) {
  const ownerId = event.owner_id;
  const id = text(payload.id, event.entity_id);
  const name = text(payload.name);
  if (!id || !name) throw new Error('Product event is missing its ID or name.');
  const at = text(payload.updated_at, text(payload.created_at, event.occurred_at));
  if (event.operation === 'product.create') {
    const locationId = text(payload.location_id, ownerId + ':main');
    await ensureLocation(db, ownerId, locationId, text(payload.location_name, 'Main shop'), true, at);
    const opening = number(payload.opening);
    await db.runAsync('INSERT OR IGNORE INTO products (id, owner_id, name, sku, category, unit, price_cents, cost_cents, stock_quantity, reorder_level, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)', id, ownerId, name, text(payload.sku) || null, text(payload.category, 'Other'), text(payload.unit, 'each'), int(either(payload, 'priceCents', 'price_cents')), int(either(payload, 'costCents', 'cost_cents')), opening, number(payload.reorder), at, at);
    if (opening > 0) {
      await db.runAsync('INSERT OR IGNORE INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)', ownerId, id, locationId, opening, at);
      await db.runAsync("INSERT OR IGNORE INTO stock_movements (id, owner_id, product_id, movement_type, quantity, to_location_id, unit_cost_cents, note, created_at, sync_state) VALUES (?, ?, ?, 'OPENING', ?, ?, ?, 'Opening stock', ?, 'SYNCED')", id + ':opening', ownerId, id, opening, locationId, int(either(payload, 'costCents', 'cost_cents')), at);
    }
    return;
  }
  const current = await db.getFirstAsync<{ updated_at: string }>('SELECT updated_at FROM products WHERE id = ? AND owner_id = ?', id, ownerId);
  if (current && current.updated_at >= at) return;
  await db.runAsync('UPDATE products SET name = ?, sku = ?, category = ?, unit = ?, price_cents = ?, cost_cents = ?, reorder_level = ?, updated_at = ? WHERE id = ? AND owner_id = ?', name, text(payload.sku) || null, text(payload.category, 'Other'), text(payload.unit, 'each'), int(either(payload, 'priceCents', 'price_cents')), int(either(payload, 'costCents', 'cost_cents')), number(either(payload, 'reorder', 'reorder_level')), at, id, ownerId);
}

async function applySale(db: SQLiteDatabase, event: RemoteSyncEvent, payload: Payload) {
  const ownerId = event.owner_id;
  const id = text(payload.id, event.entity_id);
  if (await db.getFirstAsync('SELECT id FROM sales WHERE id = ? AND owner_id = ?', id, ownerId)) return;
  let locationId = text(payload.location_id);
  let sellerId = text(payload.seller_id);
  if (!locationId) {
    const primary = await db.getFirstAsync<{ id: string }>('SELECT id FROM inventory_locations WHERE owner_id = ? ORDER BY is_primary DESC, created_at LIMIT 1', ownerId);
    locationId = primary?.id ?? ownerId + ':main';
    await ensureLocation(db, ownerId, locationId, 'Main shop', true, event.occurred_at);
  }
  await ensureLocation(db, ownerId, locationId, text(payload.location_name, 'Shop location'), false, event.occurred_at);
  if (!sellerId) {
    sellerId = ownerId;
    await db.runAsync("INSERT OR IGNORE INTO sellers (id, owner_id, name, is_owner, is_active, created_at, updated_at) VALUES (?, ?, 'Shop owner', 1, 1, ?, ?)", ownerId, ownerId, event.occurred_at, event.occurred_at);
  }
  const location = await db.getFirstAsync<{ name: string }>('SELECT name FROM inventory_locations WHERE id = ? AND owner_id = ?', locationId, ownerId);
  const seller = await db.getFirstAsync<{ id: string }>('SELECT id FROM sellers WHERE id = ? AND owner_id = ?', sellerId, ownerId);
  if (!location) throw new Error('The sale’s location has not arrived on this device yet.');
  if (!seller) await db.runAsync('INSERT OR IGNORE INTO sellers (id, owner_id, name, is_owner, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', sellerId, ownerId, text(payload.seller_name, 'Seller'), sellerId === ownerId ? 1 : 0, event.occurred_at, event.occurred_at);
  const customerId = text(payload.customer_id) || null;
  if (customerId && !await db.getFirstAsync('SELECT id FROM customers WHERE id = ? AND owner_id = ?', customerId, ownerId)) throw new Error('The sale’s customer profile has not arrived on this device yet.');
  const items = Array.isArray(payload.items) ? payload.items.map(object) : [];
  if (!items.length) throw new Error('Sale event contains no items.');
  for (const item of items) {
    const productId = text(either(item, 'productId', 'product_id'));
    const quantity = number(item.quantity);
    const product = await db.getFirstAsync<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ? AND owner_id = ?', productId, ownerId);
    if (!product) throw new Error('A product in the sale has not arrived on this device yet.');
    const balance = await db.runAsync('UPDATE inventory_balances SET quantity = quantity - ?, updated_at = ? WHERE owner_id = ? AND product_id = ? AND location_id = ? AND quantity >= ?', quantity, event.occurred_at, ownerId, productId, locationId, quantity);
    if (balance.changes !== 1) throw new Error('This sale would make location stock negative; review it on the other device before syncing.');
    const global = await db.runAsync('UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE owner_id = ? AND id = ? AND stock_quantity >= ?', quantity, event.occurred_at, ownerId, productId, quantity);
    if (global.changes !== 1) throw new Error('The sale exceeds total stock on this device.');
  }
  await db.runAsync('INSERT INTO sales (id, owner_id, receipt_number, customer_id, total_cents, paid_cents, balance_cents, status, created_by, created_at, sync_state, seller_id, location_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'SYNCED\', ?, ?)', id, ownerId, text(payload.receipt_number, id), customerId, int(payload.total_cents), int(payload.paid_cents), int(payload.balance_cents), text(payload.status, 'PAID'), text(payload.created_by) || ownerId, event.occurred_at, sellerId, locationId);
  for (const [index, item] of items.entries()) {
    const itemId = text(item.id, `${id}:item:${index}`);
    const productId = text(either(item, 'productId', 'product_id'));
    const quantity = number(item.quantity);
    const unitPrice = int(either(item, 'unitPrice', 'unit_price_cents'));
    const lineTotal = int(either(item, 'lineTotal', 'line_total_cents'));
    const unitCost = int(either(item, 'unitCost', 'unit_cost_cents'));
    await db.runAsync('INSERT OR IGNORE INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, line_total_cents, unit_cost_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', itemId, id, productId, text(either(item, 'name', 'product_name')), quantity, unitPrice, lineTotal, unitCost);
    await db.runAsync("INSERT OR IGNORE INTO stock_movements (id, owner_id, product_id, movement_type, quantity, from_location_id, unit_cost_cents, note, created_at, sync_state) VALUES (?, ?, ?, 'SALE', ?, ?, ?, ?, ?, 'SYNCED')", `${id}:sale-stock:${index}`, ownerId, productId, quantity, locationId, unitCost, 'Sale ' + text(payload.receipt_number, id), event.occurred_at);
  }
  if (customerId) await db.runAsync("INSERT OR IGNORE INTO account_entries (id, owner_id, customer_id, sale_id, entry_type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, 'SALE_CHARGE', ?, ?, ?)", `${id}:credit`, ownerId, customerId, id, int(payload.total_cents), 'Sale ' + text(payload.receipt_number, id), event.occurred_at);
  const paid = int(payload.paid_cents);
  if (paid > 0) {
    const paymentId = `${id}:payment`;
    await db.runAsync("INSERT OR IGNORE INTO payments (id, owner_id, customer_id, sale_id, amount_cents, method, kind, note, created_at, sync_state) VALUES (?, ?, ?, ?, ?, ?, 'SALE', ?, ?, 'SYNCED')", paymentId, ownerId, customerId, id, paid, text(payload.payment_method, 'CASH'), 'Payment received · ' + text(payload.payment_method, 'CASH'), event.occurred_at);
    if (customerId) await db.runAsync("INSERT OR IGNORE INTO account_entries (id, owner_id, customer_id, sale_id, payment_id, entry_type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, ?, ?)", `${id}:paid-entry`, ownerId, customerId, id, paymentId, -paid, 'Payment received', event.occurred_at);
  }
}

async function applyStockMovement(db: SQLiteDatabase, event: RemoteSyncEvent, payload: Payload) {
  const ownerId = event.owner_id;
  const id = text(payload.id, event.entity_id);
  if (await db.getFirstAsync('SELECT id FROM stock_movements WHERE id = ? AND owner_id = ?', id, ownerId)) return;
  const productId = text(payload.product_id);
  const product = await db.getFirstAsync<{ unit: string; cost_cents: number }>('SELECT unit, cost_cents FROM products WHERE id = ? AND owner_id = ?', productId, ownerId);
  if (!product) throw new Error('The stock movement’s product has not arrived on this device yet.');
  const at = text(payload.created_at, event.occurred_at);
  const kind = event.operation;
  const locationId = text(payload.location_id);
  if (kind === 'stock.receive') {
    await ensureLocation(db, ownerId, locationId, 'Shop location', false, at);
    const quantity = number(payload.quantity);
    const cost = int(payload.unit_cost_cents);
    await db.runAsync('INSERT INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at', ownerId, productId, locationId, quantity, at);
    await db.runAsync('UPDATE products SET stock_quantity = stock_quantity + ?, cost_cents = ?, updated_at = ? WHERE id = ? AND owner_id = ?', quantity, cost, at, productId, ownerId);
    await db.runAsync("INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, to_location_id, unit_cost_cents, note, created_at, sync_state) VALUES (?, ?, ?, 'RECEIVE', ?, ?, ?, ?, ?, 'SYNCED')", id, ownerId, productId, quantity, locationId, cost, text(payload.note) || null, at);
    return;
  }
  if (kind === 'stock.adjust') {
    await ensureLocation(db, ownerId, locationId, 'Shop location', false, at);
    const delta = number(payload.delta);
    if (delta < 0) {
      const changed = await db.runAsync('UPDATE inventory_balances SET quantity = quantity + ?, updated_at = ? WHERE owner_id = ? AND product_id = ? AND location_id = ? AND quantity >= ?', delta, at, ownerId, productId, locationId, -delta);
      if (changed.changes !== 1) throw new Error('A stock count would make this location negative; resolve the count on the original device.');
    } else await db.runAsync('INSERT INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at', ownerId, productId, locationId, delta, at);
    const global = await db.runAsync('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ? AND owner_id = ? AND stock_quantity + ? >= 0', delta, at, productId, ownerId, delta);
    if (global.changes !== 1) throw new Error('The stock count conflicts with newer inventory on this device.');
    await db.runAsync("INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, from_location_id, to_location_id, unit_cost_cents, note, created_at, sync_state) VALUES (?, ?, ?, 'ADJUST', ?, ?, ?, ?, ?, ?, 'SYNCED')", id, ownerId, productId, delta, delta < 0 ? locationId : null, delta > 0 ? locationId : null, product.cost_cents, text(payload.note) || null, at);
    return;
  }
  if (kind === 'stock.transfer') {
    const fromId = text(payload.from_location_id);
    const toId = text(payload.to_location_id);
    await ensureLocation(db, ownerId, fromId, 'Shop location', false, at);
    await ensureLocation(db, ownerId, toId, 'Shop location', false, at);
    const quantity = number(payload.quantity);
    const changed = await db.runAsync('UPDATE inventory_balances SET quantity = quantity - ?, updated_at = ? WHERE owner_id = ? AND product_id = ? AND location_id = ? AND quantity >= ?', quantity, at, ownerId, productId, fromId, quantity);
    if (changed.changes !== 1) throw new Error('A transfer exceeds stock at its source location.');
    await db.runAsync('INSERT INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at', ownerId, productId, toId, quantity, at);
    await db.runAsync("INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, from_location_id, to_location_id, unit_cost_cents, note, created_at, sync_state) VALUES (?, ?, ?, 'TRANSFER', ?, ?, ?, ?, ?, ?, 'SYNCED')", id, ownerId, productId, quantity, fromId, toId, product.cost_cents, text(payload.note) || null, at);
  }
}

/** Applies remote changes with entity-specific conflict rules: timestamp LWW for editable profiles/settings, immutable append for sales/payments, and reject inbound stock events that would create negative inventory. */
export async function applyRemoteEvent(db: SQLiteDatabase, event: RemoteSyncEvent) {
  const payload = object(event.payload);
  switch (event.operation) {
    case 'location.create':
      await ensureLocation(db, event.owner_id, text(payload.id, event.entity_id), text(payload.name, 'Shop location'), payload.is_primary === true, text(payload.created_at, event.occurred_at));
      break;
    case 'seller.create':
      await db.runAsync('INSERT OR IGNORE INTO sellers (id, owner_id, name, phone, is_owner, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)', text(payload.id, event.entity_id), event.owner_id, text(payload.name, 'Seller'), text(payload.phone) || null, payload.is_owner === true ? 1 : 0, text(payload.created_at, event.occurred_at), text(payload.created_at, event.occurred_at));
      break;
    case 'customer.create':
      await db.runAsync('INSERT OR IGNORE INTO customers (id, owner_id, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', text(payload.id, event.entity_id), event.owner_id, text(payload.name, 'Customer'), text(payload.phone) || null, text(payload.created_at, event.occurred_at), text(payload.created_at, event.occurred_at));
      break;
    case 'product.create':
    case 'product.update':
      await applyProduct(db, event, payload);
      break;
    case 'sale.create':
      await applySale(db, event, payload);
      break;
    case 'stock.receive':
    case 'stock.adjust':
    case 'stock.transfer':
      await applyStockMovement(db, event, payload);
      break;
    case 'credit.repayment.create': {
      const id = text(payload.id, event.entity_id);
      const customerId = text(payload.customer_id);
      if (await db.getFirstAsync('SELECT id FROM payments WHERE id = ? AND owner_id = ?', id, event.owner_id)) break;
      if (!await db.getFirstAsync('SELECT id FROM customers WHERE id = ? AND owner_id = ?', customerId, event.owner_id)) throw new Error('The repayment customer has not arrived on this device yet.');
      const amount = int(payload.amount_cents);
      const note = text(payload.note) || null;
      await db.runAsync("INSERT INTO payments (id, owner_id, customer_id, amount_cents, method, kind, note, created_at, sync_state) VALUES (?, ?, ?, ?, ?, 'REPAYMENT', ?, ?, 'SYNCED')", id, event.owner_id, customerId, amount, text(payload.method, 'CASH'), note, text(payload.created_at, event.occurred_at));
      await db.runAsync("INSERT INTO account_entries (id, owner_id, customer_id, payment_id, entry_type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, 'PAYMENT', ?, ?, ?)", `${id}:account`, event.owner_id, customerId, id, -amount, note || 'Payment received', text(payload.created_at, event.occurred_at));
      break;
    }
    case 'expense.create':
      await db.runAsync("INSERT OR IGNORE INTO expenses (id, owner_id, title, category, amount_cents, payment_method, note, spent_at, created_at, sync_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')", text(payload.id, event.entity_id), event.owner_id, text(payload.title, 'Expense'), text(payload.category, 'Other'), int(either(payload, 'amountCents', 'amount_cents')), text(either(payload, 'method', 'payment_method'), 'CASH'), text(payload.note) || null, text(either(payload, 'spentAt', 'spent_at'), event.occurred_at), text(payload.created_at, event.occurred_at));
      break;
    case 'settings.update': {
      const at = text(payload.updated_at, event.occurred_at);
      await db.runAsync('INSERT INTO shop_settings (owner_id, shop_name, currency, low_stock_alerts, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET shop_name = excluded.shop_name, currency = excluded.currency, low_stock_alerts = excluded.low_stock_alerts, updated_at = excluded.updated_at WHERE excluded.updated_at > shop_settings.updated_at', event.owner_id, text(payload.shop_name), text(payload.currency, 'USD'), payload.low_stock_alerts === false ? 0 : 1, at);
      break;
    }
    default:
      throw new Error(`Unsupported cloud change “${event.operation}”. Update the app to safely apply it.`);
  }
  const description = `${event.operation} · ${event.entity_type}`;
  await db.runAsync('INSERT OR IGNORE INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', `remote:${event.idempotency_key}`, event.owner_id, event.operation, event.entity_type, event.entity_id, `Synced from another device: ${description}`, event.occurred_at);
}
