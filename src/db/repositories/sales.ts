import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { PaymentMethod, Product, SaleSummary } from '@/db/schema';
import { enqueueChange } from './outbox';
import { ensurePrimaryLocation } from './inventory';

export async function listProductsForSale(db: SQLiteDatabase, ownerId: string, search = ''): Promise<Product[]> {
  const pattern = '%' + search.trim() + '%';
  return db.getAllAsync<Product>(`
    SELECT id, name, sku, category, unit, price_cents, stock_quantity, reorder_level
    FROM products WHERE owner_id = ? AND is_active = 1 AND stock_quantity > 0
      AND (name LIKE ? OR COALESCE(sku, '') LIKE ? OR category LIKE ?)
    ORDER BY name COLLATE NOCASE LIMIT 100
  `, ownerId, pattern, pattern, pattern);
}

export async function listRecentSales(db: SQLiteDatabase, ownerId: string, limit = 50): Promise<SaleSummary[]> {
  return db.getAllAsync<SaleSummary>(`
    SELECT s.id, s.receipt_number, s.customer_id, c.name AS customer_name,
      s.total_cents, s.paid_cents, s.balance_cents, s.status, s.created_at, s.sync_state
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id AND c.owner_id = s.owner_id
    WHERE s.owner_id = ? ORDER BY s.created_at DESC LIMIT ?
  `, ownerId, limit);
}

export type SaleLineInput = { productId: string; quantity: number };
export type RecordSaleInput = {
  items: SaleLineInput[];
  customerId: string | null;
  amountPaidCents: number;
  method: PaymentMethod;
  createdBy: string | null;
  ownerId: string;
};

export async function recordSale(db: SQLiteDatabase, input: RecordSaleInput) {
  if (!input.items.length) throw new Error('Add at least one product to the sale.');
  const saleId = Crypto.randomUUID();
  const receiptNumber = 'MS-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(2, 12) + '-' + saleId.slice(0, 4).toUpperCase();
  const now = new Date().toISOString();
  const lines: { id: string; productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; unitCost: number }[] = [];
  let totalCents = 0;

  for (const item of input.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('Each quantity must be greater than zero.');
    const product = await db.getFirstAsync<Product>('SELECT id, name, sku, category, unit, price_cents, stock_quantity, reorder_level FROM products WHERE id = ? AND owner_id = ? AND is_active = 1', item.productId, input.ownerId);
    if (!product) throw new Error('A product in this sale is no longer available.');
    if (item.quantity > product.stock_quantity) throw new Error('There is not enough ' + product.name + ' in stock.');
    const lineTotal = Math.round(product.price_cents * item.quantity);
    lines.push({ id: Crypto.randomUUID(), productId: product.id, name: product.name, quantity: item.quantity, unitPrice: product.price_cents, lineTotal, unitCost: product.cost_cents ?? 0 });
    totalCents += lineTotal;
  }

  if (input.amountPaidCents < 0 || input.amountPaidCents > totalCents) throw new Error('The amount paid must be between zero and the sale total.');
  const balanceCents = totalCents - input.amountPaidCents;
  if (balanceCents > 0 && !input.customerId) throw new Error('Choose a credit customer before leaving a balance.');
  const status = balanceCents === 0 ? 'PAID' : input.amountPaidCents > 0 ? 'PARTIAL' : 'CREDIT';
  const outboxPayload = { id: saleId, receipt_number: receiptNumber, customer_id: input.customerId, total_cents: totalCents, paid_cents: input.amountPaidCents, balance_cents: balanceCents, status, created_at: now, items: lines };

  await db.withTransactionAsync(async () => {
    await ensurePrimaryLocation(db, input.ownerId);
    if (input.customerId) {
      const customer = await db.getFirstAsync<{ id: string }>('SELECT id FROM customers WHERE id = ? AND owner_id = ?', input.customerId, input.ownerId);
      if (!customer) throw new Error('Choose a customer from this shop before recording credit.');
    }
    await db.runAsync('INSERT INTO sales (id, owner_id, receipt_number, customer_id, total_cents, paid_cents, balance_cents, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', saleId, input.ownerId, receiptNumber, input.customerId, totalCents, input.amountPaidCents, balanceCents, status, input.createdBy, now);
    for (const line of lines) {
      const changed = await db.runAsync('UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND owner_id = ? AND stock_quantity >= ?', line.quantity, now, line.productId, input.ownerId, line.quantity);
      if (changed.changes !== 1) throw new Error('Stock changed while completing this sale. Please review the cart and try again.');
      await db.runAsync('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, line_total_cents, unit_cost_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', line.id, saleId, line.productId, line.name, line.quantity, line.unitPrice, line.lineTotal, line.unitCost);
      let remaining = line.quantity;
      const balances = await db.getAllAsync<{ location_id: string; quantity: number }>('SELECT b.location_id, b.quantity FROM inventory_balances b JOIN inventory_locations l ON l.id = b.location_id WHERE b.owner_id = ? AND b.product_id = ? AND b.quantity > 0 ORDER BY l.is_primary DESC, l.created_at', input.ownerId, line.productId);
      for (const balance of balances) {
        if (remaining <= 0) break;
        const taken = Math.min(balance.quantity, remaining);
        await db.runAsync('UPDATE inventory_balances SET quantity = quantity - ?, updated_at = ? WHERE owner_id = ? AND product_id = ? AND location_id = ? AND quantity >= ?', taken, now, input.ownerId, line.productId, balance.location_id, taken);
        await db.runAsync(`INSERT INTO stock_movements (id, owner_id, product_id, movement_type, quantity, from_location_id, unit_cost_cents, note, created_at) VALUES (?, ?, ?, 'SALE', ?, ?, ?, ?, ?)`, Crypto.randomUUID(), input.ownerId, line.productId, taken, balance.location_id, line.unitCost, 'Sale ' + receiptNumber, now);
        remaining -= taken;
      }
      if (remaining > 0) throw new Error('Available stock locations changed while completing this sale. Please review the cart and try again.');
    }
    if (input.customerId) {
      await db.runAsync('INSERT INTO account_entries (id, owner_id, customer_id, sale_id, entry_type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), input.ownerId, input.customerId, saleId, 'SALE_CHARGE', totalCents, 'Sale ' + receiptNumber, now);
    }
    if (input.amountPaidCents > 0) {
      const paymentId = Crypto.randomUUID();
      await db.runAsync('INSERT INTO payments (id, owner_id, customer_id, sale_id, amount_cents, method, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', paymentId, input.ownerId, input.customerId, saleId, input.amountPaidCents, input.method, 'SALE', now);
      if (input.customerId) await db.runAsync('INSERT INTO account_entries (id, owner_id, customer_id, sale_id, payment_id, entry_type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), input.ownerId, input.customerId, saleId, paymentId, 'PAYMENT', -input.amountPaidCents, 'Payment received · ' + input.method, now);
    }
    await enqueueChange(db, input.ownerId, 'sale', saleId, 'sale.create', outboxPayload, now);
  });
  return { id: saleId, receiptNumber, totalCents, paidCents: input.amountPaidCents, balanceCents, status };
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
    await enqueueChange(db, ownerId, 'payment', paymentId, 'credit.repayment.create', { id: paymentId, customer_id: customerId, amount_cents: amountCents, method, note: note.trim() || null, created_at: now }, now);
  });
  return id;
}
