import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { InventoryLocation, Product, StockMovement } from '@/db/schema';
import { enqueueChange } from './outbox';

const now = () => new Date().toISOString();
export async function ensurePrimaryLocation(db: SQLiteDatabase, ownerId: string) {
  let location = await db.getFirstAsync<InventoryLocation>('SELECT id, name, is_primary FROM inventory_locations WHERE owner_id = ? ORDER BY is_primary DESC, created_at LIMIT 1', ownerId);
  if (!location) {
    const id = Crypto.randomUUID(); const at = now();
    await db.runAsync('INSERT INTO inventory_locations (id, owner_id, name, is_primary, created_at) VALUES (?, ?, ?, 1, ?)', id, ownerId, 'Main shop', at);
    location = { id, name: 'Main shop', is_primary: 1 };
  }
  await db.runAsync('INSERT OR IGNORE INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) SELECT owner_id, id, ?, stock_quantity, updated_at FROM products WHERE owner_id = ?', location.id, ownerId);
  return location;
}
export async function listLocations(db: SQLiteDatabase, ownerId: string) { return db.getAllAsync<InventoryLocation>('SELECT id, name, is_primary FROM inventory_locations WHERE owner_id = ? ORDER BY is_primary DESC, name', ownerId); }
export async function listInventory(db: SQLiteDatabase, ownerId: string, search = '') {
  const pattern = '%' + search.trim() + '%';
  return db.getAllAsync<Product>(`SELECT id, name, sku, category, unit, price_cents, cost_cents, stock_quantity, reorder_level FROM products WHERE owner_id = ? AND is_active = 1 AND (name LIKE ? OR COALESCE(sku, '') LIKE ? OR category LIKE ?) ORDER BY CASE WHEN stock_quantity <= reorder_level THEN 0 ELSE 1 END, name COLLATE NOCASE`, ownerId, pattern, pattern, pattern);
}
export async function getProduct(db: SQLiteDatabase, ownerId: string, id: string) { return db.getFirstAsync<Product>('SELECT id, name, sku, category, unit, price_cents, cost_cents, stock_quantity, reorder_level FROM products WHERE owner_id = ? AND id = ? AND is_active = 1', ownerId, id); }
export async function addProduct(db: SQLiteDatabase, ownerId: string, input: { name: string; sku: string; category: string; unit: string; priceCents: number; costCents: number; opening: number; reorder: number }) {
  if (!input.name.trim() || input.priceCents < 0 || input.costCents < 0 || input.opening < 0 || input.reorder < 0) throw new Error('Check the product details and quantities.');
  const id = Crypto.randomUUID(); const at = now();
  await db.withTransactionAsync(async () => {
    const exists = input.sku.trim() ? await db.getFirstAsync<{ id: string }>('SELECT id FROM products WHERE owner_id = ? AND sku = ? AND is_active = 1', ownerId, input.sku.trim()) : null;
    if (exists) throw new Error('That product code is already in use.');
    await db.runAsync('INSERT INTO products (id, owner_id, name, sku, category, unit, price_cents, cost_cents, stock_quantity, reorder_level, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)', id, ownerId, input.name.trim(), input.sku.trim() || null, input.category.trim() || 'Other', input.unit.trim() || 'each', input.priceCents, input.costCents, input.opening, input.reorder, at, at);
    const location = await ensurePrimaryLocation(db, ownerId);
    await db.runAsync('INSERT INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)', ownerId, id, location.id, input.opening, at);
    if (input.opening > 0) await db.runAsync(`INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, to_location_id, unit_cost_cents, note, created_at) VALUES (?, ?, ?, 'OPENING', ?, ?, ?, ?, ?)`, Crypto.randomUUID(), ownerId, id, input.opening, location.id, input.costCents, 'Opening stock', at);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'CREATE', 'product', ?, ?, ?)`, Crypto.randomUUID(), ownerId, id, 'Added product ' + input.name.trim(), at);
    await enqueueChange(db, ownerId, 'product', id, 'product.create', { id, ...input, name: input.name.trim(), created_at: at }, at);
  });
  return id;
}
export async function updateProduct(db: SQLiteDatabase, ownerId: string, id: string, input: { name: string; sku: string; category: string; unit: string; priceCents: number; costCents: number; reorder: number }) {
  if (!input.name.trim() || input.priceCents < 0 || input.costCents < 0 || input.reorder < 0) throw new Error('Check the product details.');
  const at = now();
  await db.withTransactionAsync(async () => {
    const current = await getProduct(db, ownerId, id);
    if (!current) throw new Error('Product not found.');
    const sku = input.sku.trim() || null;
    if (sku) {
      const duplicate = await db.getFirstAsync<{ id: string }>('SELECT id FROM products WHERE owner_id = ? AND sku = ? AND id != ? AND is_active = 1', ownerId, sku, id);
      if (duplicate) throw new Error('That product code is already in use.');
    }
    await db.runAsync('UPDATE products SET name = ?, sku = ?, category = ?, unit = ?, price_cents = ?, cost_cents = ?, reorder_level = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND is_active = 1', input.name.trim(), sku, input.category.trim() || 'Other', input.unit.trim() || 'each', input.priceCents, input.costCents, input.reorder, at, id, ownerId);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'UPDATE', 'product', ?, ?, ?)`, Crypto.randomUUID(), ownerId, id, 'Updated product ' + input.name.trim(), at);
    await enqueueChange(db, ownerId, 'product', id, 'product.update', { id, ...input, sku, name: input.name.trim(), category: input.category.trim() || 'Other', unit: input.unit.trim() || 'each', updated_at: at }, at);
  });
}
export async function receiveStock(db: SQLiteDatabase, ownerId: string, productId: string, quantity: number, unitCostCents: number, note: string, locationId?: string) {
  if (!Number.isFinite(quantity) || quantity <= 0 || unitCostCents < 0) throw new Error('Enter a quantity greater than zero and a valid cost.');
  const at = now(); const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    const product = await getProduct(db, ownerId, productId); if (!product) throw new Error('Product not found.');
    const location = locationId ? await db.getFirstAsync<InventoryLocation>('SELECT id, name, is_primary FROM inventory_locations WHERE id = ? AND owner_id = ?', locationId, ownerId) : await ensurePrimaryLocation(db, ownerId);
    if (!location) throw new Error('Choose a shop location.');
    await db.runAsync('INSERT INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at', ownerId, productId, location.id, quantity, at);
    await db.runAsync('UPDATE products SET stock_quantity = stock_quantity + ?, cost_cents = ?, updated_at = ? WHERE id = ? AND owner_id = ?', quantity, unitCostCents, at, productId, ownerId);
    await db.runAsync(`INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, to_location_id, unit_cost_cents, note, created_at) VALUES (?, ?, ?, 'RECEIVE', ?, ?, ?, ?, ?)`, id, ownerId, productId, quantity, location.id, unitCostCents, note.trim() || null, at);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'RECEIVE', 'stock', ?, ?, ?)`, Crypto.randomUUID(), ownerId, productId, 'Received ' + quantity + ' ' + product.unit + ' of ' + product.name, at);
    await enqueueChange(db, ownerId, 'stock_movement', id, 'stock.receive', { id, product_id: productId, quantity, location_id: location.id, unit_cost_cents: unitCostCents, note, created_at: at }, at);
  });
}
export async function adjustStock(db: SQLiteDatabase, ownerId: string, productId: string, newQuantity: number, note: string, locationId?: string) {
  if (!Number.isFinite(newQuantity) || newQuantity < 0 || !note.trim()) throw new Error('Enter the counted quantity and a short reason.');
  const at = now(); const movementId = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    const product = await getProduct(db, ownerId, productId); if (!product) throw new Error('Product not found.');
    const location = locationId ? await db.getFirstAsync<InventoryLocation>('SELECT id, name, is_primary FROM inventory_locations WHERE id = ? AND owner_id = ?', locationId, ownerId) : await ensurePrimaryLocation(db, ownerId);
    if (!location) throw new Error('Choose a shop location.');
    const balance = await db.getFirstAsync<{ quantity: number }>('SELECT quantity FROM inventory_balances WHERE owner_id = ? AND product_id = ? AND location_id = ?', ownerId, productId, location.id);
    const previous = balance?.quantity ?? 0; const delta = newQuantity - previous;
    await db.runAsync('INSERT INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at', ownerId, productId, location.id, newQuantity, at);
    await db.runAsync('UPDATE products SET stock_quantity = MAX(0, stock_quantity + ?), updated_at = ? WHERE id = ? AND owner_id = ?', delta, at, productId, ownerId);
    await db.runAsync(`INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, from_location_id, to_location_id, unit_cost_cents, note, created_at) VALUES (?, ?, ?, 'ADJUST', ?, ?, ?, ?, ?, ?)`, movementId, ownerId, productId, delta, delta < 0 ? location.id : null, delta > 0 ? location.id : null, product.cost_cents ?? 0, note.trim(), at);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'ADJUST', 'stock', ?, ?, ?)`, Crypto.randomUUID(), ownerId, productId, 'Stock count changed for ' + product.name + ': ' + previous + ' → ' + newQuantity, at);
    await enqueueChange(db, ownerId, 'stock_movement', movementId, 'stock.adjust', { id: movementId, product_id: productId, previous, quantity: newQuantity, delta, location_id: location.id, note: note.trim(), created_at: at }, at);
  });
}
export async function transferStock(db: SQLiteDatabase, ownerId: string, productId: string, quantity: number, fromId: string, toId: string, note: string) {
  if (!Number.isFinite(quantity) || quantity <= 0 || fromId === toId) throw new Error('Choose two different locations and a quantity greater than zero.');
  const at = now(); const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    const product = await getProduct(db, ownerId, productId); if (!product) throw new Error('Product not found.');
    const from = await db.getFirstAsync<InventoryLocation>('SELECT id, name, is_primary FROM inventory_locations WHERE id = ? AND owner_id = ?', fromId, ownerId);
    const to = await db.getFirstAsync<InventoryLocation>('SELECT id, name, is_primary FROM inventory_locations WHERE id = ? AND owner_id = ?', toId, ownerId);
    if (!from || !to) throw new Error('Choose valid locations for this shop.');
    const changed = await db.runAsync('UPDATE inventory_balances SET quantity = quantity - ?, updated_at = ? WHERE owner_id = ? AND product_id = ? AND location_id = ? AND quantity >= ?', quantity, at, ownerId, productId, fromId, quantity);
    if (changed.changes !== 1) throw new Error('There is not enough stock at the selected location.');
    await db.runAsync('INSERT INTO inventory_balances (owner_id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at', ownerId, productId, toId, quantity, at);
    await db.runAsync(`INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, from_location_id, to_location_id, unit_cost_cents, note, created_at) VALUES (?, ?, ?, 'TRANSFER', ?, ?, ?, ?, ?, ?)`, id, ownerId, productId, quantity, fromId, toId, product.cost_cents ?? 0, note.trim() || null, at);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'TRANSFER', 'stock', ?, ?, ?)`, Crypto.randomUUID(), ownerId, productId, 'Transferred ' + quantity + ' ' + product.unit + ' of ' + product.name + ' from ' + from.name + ' to ' + to.name, at);
    await enqueueChange(db, ownerId, 'stock_movement', id, 'stock.transfer', { id, product_id: productId, quantity, from_location_id: fromId, to_location_id: toId, note, created_at: at }, at);
  });
}
export async function listMovements(db: SQLiteDatabase, ownerId: string, productId?: string) { return db.getAllAsync<StockMovement>(`SELECT m.id, m.product_id, p.name AS product_name, m.movement_type, m.quantity, f.name AS from_location, t.name AS to_location, m.unit_cost_cents, m.note, m.created_at FROM stock_movements m JOIN products p ON p.id = m.product_id LEFT JOIN inventory_locations f ON f.id = m.from_location_id LEFT JOIN inventory_locations t ON t.id = m.to_location_id WHERE m.owner_id = ? ${productId ? 'AND m.product_id = ?' : ''} ORDER BY m.created_at DESC LIMIT 200`, ...(productId ? [ownerId, productId] : [ownerId])); }
export async function addLocation(db: SQLiteDatabase, ownerId: string, name: string) {
  if (!name.trim()) throw new Error('Enter a location name.'); const id = Crypto.randomUUID(); const at = now();
  await db.runAsync('INSERT INTO inventory_locations (id, owner_id, name, is_primary, created_at) VALUES (?, ?, ?, 0, ?)', id, ownerId, name.trim(), at).catch((error: unknown) => { throw new Error('That location already exists.'); });
  await enqueueChange(db, ownerId, 'inventory_location', id, 'location.create', { id, name: name.trim(), created_at: at }, at); return id;
}
