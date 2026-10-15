import type { SQLiteDatabase } from 'expo-sqlite';
import type { SaleSummary } from '@/db/schema';

export type DashboardData = {
  salesTodayCents: number;
  paymentsTodayCents: number;
  creditOutstandingCents: number;
  activeCustomers: number;
  lowStockCount: number;
  recentSales: SaleSummary[];
  weeklySales: { label: string; totalCents: number }[];
};

export async function getDashboardData(db: SQLiteDatabase, ownerId: string): Promise<DashboardData> {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const sales = await db.getFirstAsync<{ value: number }>('SELECT COALESCE(SUM(total_cents), 0) AS value FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ?', ownerId, start, end);
  const payments = await db.getFirstAsync<{ value: number }>("SELECT COALESCE(SUM(amount_cents), 0) AS value FROM payments WHERE owner_id = ? AND created_at >= ? AND created_at < ? AND kind = 'SALE'", ownerId, start, end);
  const credit = await db.getFirstAsync<{ value: number }>('SELECT COALESCE(SUM(amount_cents), 0) AS value FROM account_entries WHERE owner_id = ?', ownerId);
  const customers = await db.getFirstAsync<{ value: number }>('SELECT COUNT(*) AS value FROM customers WHERE owner_id = ?', ownerId);
  const lowStock = await db.getFirstAsync<{ value: number }>('SELECT COUNT(*) AS value FROM products WHERE owner_id = ? AND is_active = 1 AND stock_quantity <= reorder_level', ownerId);
  const recentSales = await db.getAllAsync<SaleSummary>(`SELECT s.id, s.receipt_number, s.customer_id, c.name AS customer_name, s.total_cents, s.paid_cents, s.balance_cents, s.status, s.created_at, s.sync_state FROM sales s LEFT JOIN customers c ON c.id = s.customer_id AND c.owner_id = s.owner_id WHERE s.owner_id = ? ORDER BY s.created_at DESC LIMIT 5`, ownerId);
  const weeklySales: DashboardData['weeklySales'] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset + 1);
    const total = await db.getFirstAsync<{ value: number }>('SELECT COALESCE(SUM(total_cents), 0) AS value FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ?', ownerId, dayStart.toISOString(), dayEnd.toISOString());
    weeklySales.push({ label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(dayStart), totalCents: total?.value ?? 0 });
  }
  return {
    salesTodayCents: sales?.value ?? 0,
    paymentsTodayCents: payments?.value ?? 0,
    creditOutstandingCents: Math.max(0, credit?.value ?? 0),
    activeCustomers: customers?.value ?? 0,
    lowStockCount: lowStock?.value ?? 0,
    recentSales,
    weeklySales,
  };
}
