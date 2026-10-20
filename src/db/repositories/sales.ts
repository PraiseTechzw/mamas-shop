import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { InventoryLocation, PaymentMethod, Product, SaleSummary, Seller } from '@/db/schema';
import { enqueueChange } from './outbox';
import { ensurePrimaryLocation } from './inventory';

export async function listProductsForSale(db: SQLiteDatabase, ownerId: string, search = '', locationId?: string | null): Promise<Product[]> {
  const pattern = '%' + search.trim() + '%';
  return db.getAllAsync<Product>(`
    SELECT p.id, p.name, p.sku, p.category, p.unit, p.price_cents, p.cost_cents, p.image_uri,
      ${locationId ? 'COALESCE(b.quantity, 0)' : 'p.stock_quantity'} AS stock_quantity, p.reorder_level
    FROM products p ${locationId ? 'LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.location_id = ? AND b.owner_id = p.owner_id' : ''}
    WHERE p.owner_id = ? AND p.is_active = 1 AND ${locationId ? 'COALESCE(b.quantity, 0)' : 'p.stock_quantity'} > 0
      AND (p.name LIKE ? OR COALESCE(p.sku, '') LIKE ? OR p.category LIKE ?)
    ORDER BY p.name COLLATE NOCASE LIMIT 100
  `, ...(locationId ? [locationId, ownerId, pattern, pattern, pattern] : [ownerId, pattern, pattern, pattern]));
}

export async function listRecentSales(db: SQLiteDatabase, ownerId: string, limit = 50): Promise<SaleSummary[]> {
  return db.getAllAsync<SaleSummary>(`
    SELECT s.id, s.receipt_number, s.customer_id, c.name AS customer_name,
      s.seller_id, se.name AS seller_name, s.location_id, l.name AS location_name,
      s.total_cents, s.paid_cents, s.balance_cents, s.status, s.created_at, s.sync_state,
      COALESCE((SELECT SUM(si.quantity) FROM sale_items si WHERE si.sale_id = s.id), 0) AS item_count,
      (SELECT CASE WHEN COUNT(DISTINCT p.method) > 1 THEN 'MIXED' ELSE MAX(p.method) END
        FROM payments p WHERE p.sale_id = s.id AND p.kind = 'SALE') AS payment_method
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id AND c.owner_id = s.owner_id
      LEFT JOIN sellers se ON se.id = s.seller_id AND se.owner_id = s.owner_id
      LEFT JOIN inventory_locations l ON l.id = s.location_id AND l.owner_id = s.owner_id
    WHERE s.owner_id = ? ORDER BY s.created_at DESC LIMIT ?
  `, ownerId, limit);
}

export async function listSalesBetween(db: SQLiteDatabase, ownerId: string, startInclusive: string, endExclusive: string, limit = 1000): Promise<SaleSummary[]> {
  return db.getAllAsync<SaleSummary>(`
    SELECT s.id, s.receipt_number, s.customer_id, c.name AS customer_name,
      s.seller_id, se.name AS seller_name, s.location_id, l.name AS location_name,
      s.total_cents, s.paid_cents, s.balance_cents, s.status, s.created_at, s.sync_state,
      COALESCE((SELECT SUM(si.quantity) FROM sale_items si WHERE si.sale_id = s.id), 0) AS item_count,
      (SELECT CASE WHEN COUNT(DISTINCT p.method) > 1 THEN 'MIXED' ELSE MAX(p.method) END
        FROM payments p WHERE p.sale_id = s.id AND p.kind = 'SALE') AS payment_method
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id AND c.owner_id = s.owner_id
      LEFT JOIN sellers se ON se.id = s.seller_id AND se.owner_id = s.owner_id
      LEFT JOIN inventory_locations l ON l.id = s.location_id AND l.owner_id = s.owner_id
    WHERE s.owner_id = ? AND s.created_at >= ? AND s.created_at < ?
    ORDER BY s.created_at DESC LIMIT ?
  `, ownerId, startInclusive, endExclusive, limit);
}

export type SaleLineInput = { productId: string; quantity: number };
export type RecordSaleInput = {
  items: SaleLineInput[];
  customerId: string | null;
  amountPaidCents: number;
  amountTenderedCents?: number;
  changeDueCents?: number;
  method: PaymentMethod;
  createdBy: string | null;
  sellerId: string | null;
  locationId: string | null;
  ownerId: string;
};

export async function recordSale(db: SQLiteDatabase, input: RecordSaleInput) {
  if (!input.items.length) throw new Error('Add at least one product to the sale.');
  const saleId = Crypto.randomUUID();
  const receiptNumber = 'MS-' + new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replaceAll('T', '').replaceAll('Z', '').replaceAll('.', '').slice(2, 12) + '-' + saleId.slice(0, 4).toUpperCase();
  const now = new Date().toISOString();
  const defaultLocation = input.locationId ? null : await ensurePrimaryLocation(db, input.ownerId);
  const selectedLocation = input.locationId
    ? await db.getFirstAsync<InventoryLocation>('SELECT id, name, is_primary FROM inventory_locations WHERE id = ? AND owner_id = ?', input.locationId, input.ownerId)
    : defaultLocation;
  if (!selectedLocation) throw new Error('Choose an active location before completing the sale.');
  if (!input.sellerId) throw new Error('Choose the seller responsible for this sale.');
  const selectedSeller = await db.getFirstAsync<Seller>('SELECT id, name FROM sellers WHERE id = ? AND owner_id = ? AND is_active = 1', input.sellerId, input.ownerId);
  if (!selectedSeller) throw new Error('Choose an active seller for this shop.');
  const lines: { id: string; productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; unitCost: number }[] = [];
  let totalCents = 0;

  for (const item of input.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('Each quantity must be greater than zero.');
    const product = await db.getFirstAsync<Product>('SELECT p.id, p.name, p.sku, p.category, p.unit, p.price_cents, p.cost_cents, b.quantity AS stock_quantity, p.reorder_level FROM products p JOIN inventory_balances b ON b.product_id = p.id AND b.owner_id = p.owner_id AND b.location_id = ? WHERE p.id = ? AND p.owner_id = ? AND p.is_active = 1', selectedLocation.id, item.productId, input.ownerId);
    if (!product) throw new Error('A product in this sale is no longer available.');
    if (item.quantity > product.stock_quantity) throw new Error('There is not enough ' + product.name + ' in stock.');
    const lineTotal = Math.round(product.price_cents * item.quantity);
    lines.push({ id: Crypto.randomUUID(), productId: product.id, name: product.name, quantity: item.quantity, unitPrice: product.price_cents, lineTotal, unitCost: product.cost_cents ?? 0 });
    totalCents += lineTotal;
  }

  if (!Number.isInteger(input.amountPaidCents) || input.amountPaidCents < 0 || input.amountPaidCents > totalCents) throw new Error('The amount paid must be between zero and the sale total.');
  const balanceCents = totalCents - input.amountPaidCents;
  const changeDueCents = input.changeDueCents ?? 0;
  const amountTenderedCents = input.amountTenderedCents ?? input.amountPaidCents;
  if (!Number.isInteger(amountTenderedCents) || amountTenderedCents < 0 || !Number.isInteger(changeDueCents) || changeDueCents < 0 || changeDueCents > Math.max(0, amountTenderedCents - totalCents) || (changeDueCents > 0 && input.method !== 'CASH')) throw new Error('Change due amount is invalid.');
  if (changeDueCents > 0 && !input.customerId) throw new Error('Choose a customer to record change they will collect later.');
  if (balanceCents > 0 && !input.customerId) throw new Error('Choose a credit customer before leaving a balance.');
  const status = balanceCents === 0 ? 'PAID' : input.amountPaidCents > 0 ? 'PARTIAL' : 'CREDIT';
  const changeOwedId = changeDueCents > 0 ? Crypto.randomUUID() : null;
  const outboxPayload = { id: saleId, receipt_number: receiptNumber, customer_id: input.customerId, seller_id: input.sellerId, seller_name: selectedSeller.name, location_id: selectedLocation.id, location_name: selectedLocation.name, total_cents: totalCents, paid_cents: input.amountPaidCents, balance_cents: balanceCents, amount_tendered_cents: amountTenderedCents, change_due_cents: changeDueCents, change_owed_id: changeOwedId, payment_method: input.method, status, created_at: now, items: lines };

  await db.withTransactionAsync(async () => {
    await ensurePrimaryLocation(db, input.ownerId);
    const location = await db.getFirstAsync<InventoryLocation>('SELECT id, name, is_primary FROM inventory_locations WHERE id = ? AND owner_id = ?', selectedLocation.id, input.ownerId);
    const seller = await db.getFirstAsync<{ id: string }>('SELECT id FROM sellers WHERE id = ? AND owner_id = ? AND is_active = 1', input.sellerId, input.ownerId);
    if (!location || !seller) throw new Error('The selected seller or location is no longer available.');
    if (input.customerId) {
      const customer = await db.getFirstAsync<{ id: string }>('SELECT id FROM customers WHERE id = ? AND owner_id = ?', input.customerId, input.ownerId);
      if (!customer) throw new Error('Choose a customer from this shop before recording credit.');
    }
    await db.runAsync('INSERT INTO sales (id, owner_id, receipt_number, customer_id, total_cents, paid_cents, balance_cents, status, created_by, created_at, seller_id, location_id, amount_tendered_cents, change_due_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', saleId, input.ownerId, receiptNumber, input.customerId, totalCents, input.amountPaidCents, balanceCents, status, input.createdBy, now, input.sellerId, location.id, amountTenderedCents, changeDueCents);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'CREATE', 'sale', ?, ?, ?)`, Crypto.randomUUID(), input.ownerId, saleId, 'Recorded sale ' + receiptNumber + ' for ' + totalCents + ' cents', now);
    for (const line of lines) {
      const changed = await db.runAsync('UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND owner_id = ? AND stock_quantity >= ?', line.quantity, now, line.productId, input.ownerId, line.quantity);
      if (changed.changes !== 1) throw new Error('Stock changed while completing this sale. Please review the cart and try again.');
      await db.runAsync('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, line_total_cents, unit_cost_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', line.id, saleId, line.productId, line.name, line.quantity, line.unitPrice, line.lineTotal, line.unitCost);
      const balanceChanged = await db.runAsync('UPDATE inventory_balances SET quantity = quantity - ?, updated_at = ? WHERE owner_id = ? AND product_id = ? AND location_id = ? AND quantity >= ?', line.quantity, now, input.ownerId, line.productId, location.id, line.quantity);
      if (balanceChanged.changes !== 1) throw new Error('There is no longer enough stock at ' + location.name + '. Review the cart and try again.');
      await db.runAsync(`INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, from_location_id, unit_cost_cents, note, created_at) VALUES (?, ?, ?, 'SALE', ?, ?, ?, ?, ?)`, Crypto.randomUUID(), input.ownerId, line.productId, line.quantity, location.id, line.unitCost, 'Sale ' + receiptNumber, now);
    }
    if (input.customerId) {
      await db.runAsync('INSERT INTO account_entries (id, owner_id, customer_id, sale_id, entry_type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), input.ownerId, input.customerId, saleId, 'SALE_CHARGE', totalCents, 'Sale ' + receiptNumber, now);
    }
    if (input.amountPaidCents > 0) {
      const paymentId = Crypto.randomUUID();
      const paymentNote = 'Payment received · ' + input.method + (changeDueCents > 0 ? ' · ' + (changeDueCents / 100).toFixed(2) + ' change owed to customer' : '');
      await db.runAsync('INSERT INTO payments (id, owner_id, customer_id, sale_id, amount_cents, method, kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', paymentId, input.ownerId, input.customerId, saleId, input.amountPaidCents, input.method, 'SALE', paymentNote, now);
      if (input.customerId) await db.runAsync('INSERT INTO account_entries (id, owner_id, customer_id, sale_id, payment_id, entry_type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), input.ownerId, input.customerId, saleId, paymentId, 'PAYMENT', -input.amountPaidCents, paymentNote, now);
    }
    if (changeOwedId && changeDueCents > 0) {
      await db.runAsync('INSERT INTO change_owed (id, owner_id, customer_id, sale_id, receipt_number, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, \'OPEN\', ?)', changeOwedId, input.ownerId, input.customerId, saleId, receiptNumber, changeDueCents, now);
      await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'CREATE', 'change_owed', ?, ?, ?)`, Crypto.randomUUID(), input.ownerId, changeOwedId, 'Recorded ' + changeDueCents + ' cents change owed to customer for ' + receiptNumber, now);
      await enqueueChange(db, input.ownerId, 'change_owed', changeOwedId, 'change_owed.create', { id: changeOwedId, customer_id: input.customerId, sale_id: saleId, receipt_number: receiptNumber, amount_cents: changeDueCents, created_at: now }, now);
    }
    await enqueueChange(db, input.ownerId, 'sale', saleId, 'sale.create', outboxPayload, now);
  });
  return { id: saleId, receiptNumber, totalCents, paidCents: input.amountPaidCents, balanceCents, changeOwedCents: changeDueCents, status };
}

export async function recordRepayment(db: SQLiteDatabase, ownerId: string, customerId: string, amountCents: number, method: PaymentMethod, note: string) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Enter an amount greater than zero.');
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    const customer = await db.getFirstAsync<{ id: string }>('SELECT id FROM customers WHERE id = ? AND owner_id = ?', customerId, ownerId);
    if (!customer) throw new Error('Customer account could not be found.');
    const row = await db.getFirstAsync<{ balance_cents: number }>('SELECT COALESCE(SUM(amount_cents), 0) AS balance_cents FROM account_entries WHERE customer_id = ? AND owner_id = ?', customerId, ownerId);
    if (!row || amountCents > row.balance_cents) throw new Error('The payment is greater than the outstanding balance.');
    const paymentId = Crypto.randomUUID();
    await db.runAsync('INSERT INTO payments (id, owner_id, customer_id, amount_cents, method, kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', paymentId, ownerId, customerId, amountCents, method, 'REPAYMENT', note.trim() || null, now);
    await db.runAsync('INSERT INTO account_entries (id, owner_id, customer_id, payment_id, entry_type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, ownerId, customerId, paymentId, 'PAYMENT', -amountCents, note.trim() || 'Repayment received · ' + method, now);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'REPAYMENT', 'payment', ?, ?, ?)`, Crypto.randomUUID(), ownerId, paymentId, 'Recorded customer repayment of ' + amountCents + ' cents', now);
    await enqueueChange(db, ownerId, 'payment', paymentId, 'credit.repayment.create', { id: paymentId, customer_id: customerId, amount_cents: amountCents, method, note: note.trim() || null, created_at: now }, now);
  });
  return id;
}

export type ChangeOwedRecord = { id: string; customer_id: string; customer_name: string; sale_id: string | null; receipt_number: string | null; amount_cents: number; status: 'OPEN' | 'SETTLED'; created_at: string; settled_at: string | null };

export async function listChangeOwed(db: SQLiteDatabase, ownerId: string, options: { customerId?: string | null; status?: 'OPEN' | 'SETTLED' | 'ALL' } = {}): Promise<ChangeOwedRecord[]> {
  const filters: string[] = ['co.owner_id = ?'];
  const params: (string | number)[] = [ownerId];
  if (options.customerId) { filters.push('co.customer_id = ?'); params.push(options.customerId); }
  if (options.status && options.status !== 'ALL') { filters.push('co.status = ?'); params.push(options.status); }
  return db.getAllAsync<ChangeOwedRecord>(`
    SELECT co.id, co.customer_id, c.name AS customer_name, co.sale_id, co.receipt_number, co.amount_cents, co.status, co.created_at, co.settled_at
    FROM change_owed co JOIN customers c ON c.id = co.customer_id
    WHERE ${filters.join(' AND ')} ORDER BY co.created_at DESC LIMIT 100
  `, ...params);
}

export async function getOpenChangeOwedTotal(db: SQLiteDatabase, ownerId: string): Promise<number> {
  const row = await db.getFirstAsync<{ value: number }>("SELECT COALESCE(SUM(amount_cents), 0) AS value FROM change_owed WHERE owner_id = ? AND status = 'OPEN'", ownerId);
  return row?.value ?? 0;
}

/** Marks change owed to the customer as returned. Never touches customer credit or payment totals. */
export async function settleChangeOwed(db: SQLiteDatabase, ownerId: string, changeOwedId: string, note = '') {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    const record = await db.getFirstAsync<{ id: string; status: string; receipt_number: string | null }>('SELECT id, status, receipt_number FROM change_owed WHERE id = ? AND owner_id = ?', changeOwedId, ownerId);
    if (!record) throw new Error('This change record could not be found.');
    if (record.status === 'SETTLED') throw new Error('This change has already been returned to the customer.');
    await db.runAsync("UPDATE change_owed SET status = 'SETTLED', settled_at = ?, sync_state = 'PENDING' WHERE id = ? AND owner_id = ? AND status = 'OPEN'", now, changeOwedId, ownerId);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'SETTLE', 'change_owed', ?, ?, ?)`, Crypto.randomUUID(), ownerId, changeOwedId, 'Change returned to customer' + (record.receipt_number ? ' for ' + record.receipt_number : '') + (note.trim() ? ' · ' + note.trim() : ''), now);
    await enqueueChange(db, ownerId, 'change_owed', changeOwedId, 'change_owed.settle', { id: changeOwedId, settled_at: now }, now);
  });
}

export type SaleDetail = {
  sale: SaleSummary & { amount_tendered_cents: number | null; change_due_cents: number; created_by: string | null };
  items: { id: string; product_id: string | null; product_name: string; quantity: number; unit_price_cents: number; line_total_cents: number; unit_cost_cents: number }[];
  payments: { id: string; amount_cents: number; method: PaymentMethod; kind: 'SALE' | 'REPAYMENT'; note: string | null; created_at: string }[];
  changeOwed: ChangeOwedRecord | null;
};

export async function getSaleDetail(db: SQLiteDatabase, ownerId: string, saleId: string): Promise<SaleDetail | null> {
  const sale = await db.getFirstAsync<SaleDetail['sale']>(`
    SELECT s.id, s.receipt_number, s.customer_id, c.name AS customer_name, s.seller_id, se.name AS seller_name,
      s.location_id, l.name AS location_name, s.total_cents, s.paid_cents, s.balance_cents, s.status, s.created_at, s.sync_state,
      s.amount_tendered_cents, s.change_due_cents, s.created_by
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id AND c.owner_id = s.owner_id
      LEFT JOIN sellers se ON se.id = s.seller_id AND se.owner_id = s.owner_id
      LEFT JOIN inventory_locations l ON l.id = s.location_id AND l.owner_id = s.owner_id
    WHERE s.owner_id = ? AND s.id = ?
  `, ownerId, saleId);
  if (!sale) return null;
  const items = await db.getAllAsync<SaleDetail['items'][number]>('SELECT id, product_id, product_name, quantity, unit_price_cents, line_total_cents, unit_cost_cents FROM sale_items WHERE sale_id = ? ORDER BY rowid', saleId);
  const payments = await db.getAllAsync<SaleDetail['payments'][number]>("SELECT id, amount_cents, method, kind, note, created_at FROM payments WHERE sale_id = ? AND owner_id = ? ORDER BY created_at", saleId, ownerId);
  const changeOwed = await db.getFirstAsync<ChangeOwedRecord>(`
    SELECT co.id, co.customer_id, c.name AS customer_name, co.sale_id, co.receipt_number, co.amount_cents, co.status, co.created_at, co.settled_at
    FROM change_owed co JOIN customers c ON c.id = co.customer_id WHERE co.sale_id = ? AND co.owner_id = ?`, saleId, ownerId);
  return { sale, items, payments, changeOwed: changeOwed ?? null };
}
