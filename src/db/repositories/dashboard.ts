import type { SQLiteDatabase } from 'expo-sqlite';

export type DashboardData = {
  salesTodayCents: number;
  salesTodayCount: number;
  paymentsTodayCents: number;
  creditOutstandingCents: number;
  lowStockCount: number;
  salesBySeller: { sellerId: string | null; totalCents: number; saleCount: number }[];
};

export async function getDashboardData(db: SQLiteDatabase, ownerId: string): Promise<DashboardData> {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const sales = await db.getFirstAsync<{ value: number; count: number }>('SELECT COALESCE(SUM(total_cents), 0) AS value, COUNT(*) AS count FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ?', ownerId, start, end);
  const payments = await db.getFirstAsync<{ value: number }>("SELECT COALESCE(SUM(amount_cents), 0) AS value FROM payments WHERE owner_id = ? AND created_at >= ? AND created_at < ? AND kind = 'SALE'", ownerId, start, end);
  const credit = await db.getFirstAsync<{ value: number }>('SELECT COALESCE(SUM(amount_cents), 0) AS value FROM account_entries WHERE owner_id = ?', ownerId);
  const lowStock = await db.getFirstAsync<{ value: number }>('SELECT COUNT(*) AS value FROM products WHERE owner_id = ? AND is_active = 1 AND stock_quantity <= reorder_level', ownerId);
  const salesBySeller = await db.getAllAsync<{ sellerId: string | null; totalCents: number; saleCount: number }>(`SELECT created_by AS sellerId, COALESCE(SUM(total_cents), 0) AS totalCents, COUNT(*) AS saleCount FROM sales WHERE owner_id = ? GROUP BY created_by ORDER BY totalCents DESC LIMIT 5`, ownerId);
  return {
    salesTodayCents: sales?.value ?? 0,
    salesTodayCount: sales?.count ?? 0,
    paymentsTodayCents: payments?.value ?? 0,
    creditOutstandingCents: Math.max(0, credit?.value ?? 0),
    lowStockCount: lowStock?.value ?? 0,
    salesBySeller,
  };
}
