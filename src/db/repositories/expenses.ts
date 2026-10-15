import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { Expense, PaymentMethod } from '@/db/schema';
import { enqueueChange } from './outbox';
export async function listExpenses(db: SQLiteDatabase, ownerId: string) { return db.getAllAsync<Expense>('SELECT id, title, category, amount_cents, payment_method, note, spent_at, created_at FROM expenses WHERE owner_id = ? ORDER BY spent_at DESC LIMIT 200', ownerId); }
export async function getExpenseSummary(db: SQLiteDatabase, ownerId: string) { return db.getFirstAsync<{ total_cents: number; count: number }>('SELECT COALESCE(SUM(amount_cents), 0) AS total_cents, COUNT(*) AS count FROM expenses WHERE owner_id = ?', ownerId); }
export async function createExpense(db: SQLiteDatabase, ownerId: string, input: { title: string; category: string; amountCents: number; method: PaymentMethod; note: string; spentAt: string }) {
  if (!input.title.trim() || !input.category.trim() || !Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Enter a description, category, and amount greater than zero.');
  const id = Crypto.randomUUID(); const at = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO expenses (id, owner_id, title, category, amount_cents, payment_method, note, spent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, ownerId, input.title.trim(), input.category.trim(), input.amountCents, input.method, input.note.trim() || null, input.spentAt || at, at);
    await db.runAsync(`INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'CREATE', 'expense', ?, ?, ?)`, Crypto.randomUUID(), ownerId, id, 'Recorded expense: ' + input.title.trim(), at);
    await enqueueChange(db, ownerId, 'expense', id, 'expense.create', { id, ...input, title: input.title.trim(), created_at: at }, at);
  });
  return id;
}
