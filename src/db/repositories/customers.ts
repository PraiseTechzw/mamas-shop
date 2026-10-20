import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { AccountEntry, Customer, CustomerPurchaseItem, CustomerRepayment } from '@/db/schema';
import { enqueueChange } from './outbox';

export async function listCustomers(db: SQLiteDatabase, ownerId: string): Promise<Customer[]> {
  return db.getAllAsync<Customer>(`
    SELECT c.id, c.name, c.phone, c.created_at,
      COALESCE(SUM(a.amount_cents), 0) AS balance_cents
    FROM customers c LEFT JOIN account_entries a ON a.customer_id = c.id AND a.owner_id = c.owner_id
    WHERE c.owner_id = ? GROUP BY c.id ORDER BY c.name COLLATE NOCASE
  `, ownerId);
}

export async function getCustomer(db: SQLiteDatabase, ownerId: string, id: string): Promise<Customer | null> {
  return (await db.getFirstAsync<Customer>(`
    SELECT c.id, c.name, c.phone, c.created_at,
      COALESCE(SUM(a.amount_cents), 0) AS balance_cents
    FROM customers c LEFT JOIN account_entries a ON a.customer_id = c.id AND a.owner_id = c.owner_id
    WHERE c.owner_id = ? AND c.id = ? GROUP BY c.id
  `, ownerId, id)) ?? null;
}

export async function listAccountEntries(db: SQLiteDatabase, ownerId: string, customerId: string): Promise<AccountEntry[]> {
  return db.getAllAsync<AccountEntry>(`
    SELECT a.id, a.entry_type, a.amount_cents, a.note, a.created_at, s.receipt_number
    FROM account_entries a LEFT JOIN sales s ON s.id = a.sale_id
    WHERE a.owner_id = ? AND a.customer_id = ? ORDER BY a.created_at DESC
  `, ownerId, customerId);
}

export async function listCustomerPurchaseItems(db: SQLiteDatabase, ownerId: string, customerId: string, limit = 20): Promise<CustomerPurchaseItem[]> {
  return db.getAllAsync<CustomerPurchaseItem>(`
    SELECT si.id, si.product_name, si.quantity, si.line_total_cents, s.created_at, s.receipt_number
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.owner_id = ? AND s.customer_id = ?
    ORDER BY s.created_at DESC, si.rowid LIMIT ?
  `, ownerId, customerId, limit);
}

export async function listCustomerRepayments(db: SQLiteDatabase, ownerId: string, customerId: string, limit = 20): Promise<CustomerRepayment[]> {
  return db.getAllAsync<CustomerRepayment>(`
    SELECT id, amount_cents, method, note, created_at FROM payments
    WHERE owner_id = ? AND customer_id = ? AND kind = 'REPAYMENT'
    ORDER BY created_at DESC LIMIT ?
  `, ownerId, customerId, limit);
}

export async function updateCustomer(db: SQLiteDatabase, ownerId: string, customer: Customer, name: string, phone: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Enter the customer’s name.');
  const cleanPhone = phone.trim() || null;
  const now = new Date().toISOString();
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE customers SET name = ?, phone = ?, updated_at = ? WHERE owner_id = ? AND id = ?', cleanName, cleanPhone, now, ownerId, customer.id);
      await db.runAsync("INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'UPDATE', 'customer', ?, ?, ?)", Crypto.randomUUID(), ownerId, customer.id, 'Updated customer ' + cleanName, now);
      await enqueueChange(db, ownerId, 'customer', customer.id, 'customer.update', { id: customer.id, name: cleanName, phone: cleanPhone, updated_at: now }, now);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) throw new Error('A customer with that phone number already exists.');
    throw error;
  }
}

export async function createCustomer(db: SQLiteDatabase, ownerId: string, name: string, phone: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Enter the customer’s name.');
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO customers (id, owner_id, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, ownerId, cleanName, phone.trim() || null, now, now);
      await db.runAsync("INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'CREATE', 'customer', ?, ?, ?)", Crypto.randomUUID(), ownerId, id, 'Added customer ' + cleanName, now);
      await enqueueChange(db, ownerId, 'customer', id, 'customer.create', { id, name: cleanName, phone: phone.trim() || null, created_at: now }, now);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) throw new Error('A customer with that phone number already exists.');
    throw error;
  }
  return id;
}
