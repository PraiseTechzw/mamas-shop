import type { SQLiteDatabase } from 'expo-sqlite';
import { getOpenChangeOwedTotal } from './sales';

export type DashboardData = {
  salesTodayCents: number;
  salesTodayCount: number;
  cashReceivedTodayCents: number;
  cashPaymentsTodayCount: number;
  creditGivenTodayCents: number;
  creditSalesTodayCount: number;
  creditOutstandingCents: number;
  owingCustomerCount: number;
  changeOwedOpenCents: number;
  lowStockCount: number;
};

export async function getDashboardData(db: SQLiteDatabase, ownerId: string): Promise<DashboardData> {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const sales = await db.getFirstAsync<{ value: number; count: number }>('SELECT COALESCE(SUM(total_cents), 0) AS value, COUNT(*) AS count FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ?', ownerId, start, end);
  const cashPayments = await db.getFirstAsync<{ value: number; count: number }>("SELECT COALESCE(SUM(amount_cents), 0) AS value, COUNT(*) AS count FROM payments WHERE owner_id = ? AND method = 'CASH' AND created_at >= ? AND created_at < ?", ownerId, start, end);
  const creditGiven = await db.getFirstAsync<{ value: number; count: number }>('SELECT COALESCE(SUM(balance_cents), 0) AS value, COUNT(*) AS count FROM sales WHERE owner_id = ? AND balance_cents > 0 AND created_at >= ? AND created_at < ?', ownerId, start, end);
  const credit = await db.getFirstAsync<{ value: number }>('SELECT COALESCE(SUM(amount_cents), 0) AS value FROM account_entries WHERE owner_id = ?', ownerId);
  const owingCustomers = await db.getFirstAsync<{ value: number }>(`SELECT COUNT(*) AS value FROM (
    SELECT c.id FROM customers c
    LEFT JOIN account_entries a ON a.customer_id = c.id AND a.owner_id = c.owner_id
    WHERE c.owner_id = ? GROUP BY c.id HAVING COALESCE(SUM(a.amount_cents), 0) > 0
  )`, ownerId);
  const lowStock = await db.getFirstAsync<{ value: number }>('SELECT COUNT(*) AS value FROM products WHERE owner_id = ? AND is_active = 1 AND stock_quantity <= reorder_level', ownerId);

  return {
    salesTodayCents: sales?.value ?? 0,
    salesTodayCount: sales?.count ?? 0,
    cashReceivedTodayCents: cashPayments?.value ?? 0,
    cashPaymentsTodayCount: cashPayments?.count ?? 0,
    creditGivenTodayCents: creditGiven?.value ?? 0,
    creditSalesTodayCount: creditGiven?.count ?? 0,
    creditOutstandingCents: Math.max(0, credit?.value ?? 0),
    owingCustomerCount: owingCustomers?.value ?? 0,
    changeOwedOpenCents: await getOpenChangeOwedTotal(db, ownerId),
    lowStockCount: lowStock?.value ?? 0,
  };
}
