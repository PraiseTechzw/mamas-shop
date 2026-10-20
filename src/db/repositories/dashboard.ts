import type { SQLiteDatabase } from 'expo-sqlite';
import type { PaymentMethod } from '@/db/schema';
import { getOpenChangeOwedTotal } from './sales';

export type DashboardData = {
  salesTodayCents: number;
  salesTodayCount: number;
  /** Revenue less the cost snapshots stored on today's sale lines. */
  grossProfitTodayCents: number;
  salesYesterdayCents: number;
  salesYesterdayCount: number;
  cashReceivedTodayCents: number;
  cashPaymentsTodayCount: number;
  creditGivenTodayCents: number;
  creditSalesTodayCount: number;
  creditOutstandingCents: number;
  owingCustomerCount: number;
  changeOwedOpenCents: number;
  lowStockCount: number;
  /** ISO string of the most recent sale, or null if none today */
  lastSaleAt: string | null;
};

export type DailyPaymentBreakdown = Record<PaymentMethod, number>;

export async function getDailyPaymentBreakdown(db: SQLiteDatabase, ownerId: string): Promise<DailyPaymentBreakdown> {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const rows = await db.getAllAsync<{ method: PaymentMethod; amount_cents: number }>(
    "SELECT method, COALESCE(SUM(amount_cents), 0) AS amount_cents FROM payments WHERE owner_id = ? AND kind = 'SALE' AND created_at >= ? AND created_at < ? GROUP BY method",
    ownerId, todayStart, todayEnd,
  );
  const breakdown: DailyPaymentBreakdown = { CASH: 0, ECOCASH: 0, CARD: 0, OTHER: 0 };
  for (const row of rows) breakdown[row.method] = row.amount_cents;
  return breakdown;
}

export async function getDashboardData(db: SQLiteDatabase, ownerId: string): Promise<DashboardData> {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toISOString();

  const sales = await db.getFirstAsync<{ value: number; count: number }>(
    'SELECT COALESCE(SUM(total_cents), 0) AS value, COUNT(*) AS count FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ?',
    ownerId, todayStart, todayEnd,
  );
  const salesYesterday = await db.getFirstAsync<{ value: number; count: number }>(
    'SELECT COALESCE(SUM(total_cents), 0) AS value, COUNT(*) AS count FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ?',
    ownerId, yesterdayStart, todayStart,
  );
  const grossProfitToday = await db.getFirstAsync<{ value: number }>(`
    SELECT COALESCE(SUM(si.line_total_cents - CAST(ROUND(si.unit_cost_cents * si.quantity) AS INTEGER)), 0) AS value
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    WHERE s.owner_id = ? AND s.created_at >= ? AND s.created_at < ?`,
    ownerId, todayStart, todayEnd,
  );
  const cashPayments = await db.getFirstAsync<{ value: number; count: number }>(
    "SELECT COALESCE(SUM(amount_cents), 0) AS value, COUNT(*) AS count FROM payments WHERE owner_id = ? AND method = 'CASH' AND created_at >= ? AND created_at < ?",
    ownerId, todayStart, todayEnd,
  );
  const creditGiven = await db.getFirstAsync<{ value: number; count: number }>(
    'SELECT COALESCE(SUM(balance_cents), 0) AS value, COUNT(*) AS count FROM sales WHERE owner_id = ? AND balance_cents > 0 AND created_at >= ? AND created_at < ?',
    ownerId, todayStart, todayEnd,
  );
  const credit = await db.getFirstAsync<{ value: number }>(
    'SELECT COALESCE(SUM(amount_cents), 0) AS value FROM account_entries WHERE owner_id = ?',
    ownerId,
  );
  const owingCustomers = await db.getFirstAsync<{ value: number }>(`
    SELECT COUNT(*) AS value FROM (
      SELECT c.id FROM customers c
      LEFT JOIN account_entries a ON a.customer_id = c.id AND a.owner_id = c.owner_id
      WHERE c.owner_id = ? GROUP BY c.id HAVING COALESCE(SUM(a.amount_cents), 0) > 0
    )`, ownerId);
  const lowStock = await db.getFirstAsync<{ value: number }>(
    'SELECT COUNT(*) AS value FROM products WHERE owner_id = ? AND is_active = 1 AND stock_quantity <= reorder_level',
    ownerId,
  );
  const lastSale = await db.getFirstAsync<{ created_at: string }>(
    'SELECT created_at FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 1',
    ownerId, todayStart, todayEnd,
  );

  return {
    salesTodayCents: sales?.value ?? 0,
    salesTodayCount: sales?.count ?? 0,
    grossProfitTodayCents: grossProfitToday?.value ?? 0,
    salesYesterdayCents: salesYesterday?.value ?? 0,
    salesYesterdayCount: salesYesterday?.count ?? 0,
    cashReceivedTodayCents: cashPayments?.value ?? 0,
    cashPaymentsTodayCount: cashPayments?.count ?? 0,
    creditGivenTodayCents: creditGiven?.value ?? 0,
    creditSalesTodayCount: creditGiven?.count ?? 0,
    creditOutstandingCents: Math.max(0, credit?.value ?? 0),
    owingCustomerCount: owingCustomers?.value ?? 0,
    changeOwedOpenCents: await getOpenChangeOwedTotal(db, ownerId),
    lowStockCount: lowStock?.value ?? 0,
    lastSaleAt: lastSale?.created_at ?? null,
  };
}
