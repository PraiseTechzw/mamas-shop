import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { Expense, PaymentMethod } from '@/db/schema';
import { enqueueChange } from './outbox';

export const EXPENSE_PAGE_SIZE = 25;

export type ExpensePage = { rows: Expense[]; totalCents: number; count: number; hasMore: boolean };

export async function listExpensesPage(db: SQLiteDatabase, ownerId: string, options: { search?: string; category?: string; offset?: number } = {}): Promise<ExpensePage> {
  const filters = ['owner_id = ?'];
  const params: (string | number)[] = [ownerId];
  const search = (options.search ?? '').trim();
  if (search) { const pattern = '%' + search + '%'; filters.push('(title LIKE ? OR category LIKE ? OR COALESCE(note, \'\') LIKE ?)'); params.push(pattern, pattern, pattern); }
  const category = (options.category ?? '').trim();
  if (category && category !== 'All') { filters.push('category = ?'); params.push(category); }
  const where = filters.join(' AND ');
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const rows = await db.getAllAsync<Expense>(`SELECT id, title, category, amount_cents, payment_method, note, spent_at, created_at FROM expenses WHERE ${where} ORDER BY spent_at DESC, created_at DESC LIMIT ${EXPENSE_PAGE_SIZE} OFFSET ?`, ...params, offset);
  const summary = await db.getFirstAsync<{ total_cents: number; count: number }>(`SELECT COALESCE(SUM(amount_cents), 0) AS total_cents, COUNT(*) AS count FROM expenses WHERE ${where}`, ...params);
  return { rows, totalCents: summary?.total_cents ?? 0, count: summary?.count ?? 0, hasMore: offset + rows.length < (summary?.count ?? 0) };
}

export async function listExpenseCategories(db: SQLiteDatabase, ownerId: string) {
  return db.getAllAsync<{ category: string }>('SELECT DISTINCT category FROM expenses WHERE owner_id = ? ORDER BY category COLLATE NOCASE', ownerId);
}
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
