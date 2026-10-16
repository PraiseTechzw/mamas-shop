import type { SQLiteDatabase } from 'expo-sqlite';
import { getOpenChangeOwedTotal } from './sales';

export type DashboardData = {
  salesTodayCents: number;
  salesTodayCount: number;
  paymentsTodayCents: number;
  creditOutstandingCents: number;
  changeOwedOpenCents: number;
  lowStockCount: number;
  salesBySeller: { sellerId: string | null; sellerName: string; totalCents: number; saleCount: number }[];
  salesByLocation: { locationId: string | null; locationName: string; totalCents: number; saleCount: number }[];
};

export async function getDashboardData(db: SQLiteDatabase, ownerId: string): Promise<DashboardData> {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const sales = await db.getFirstAsync<{ value: number; count: number }>('SELECT COALESCE(SUM(total_cents), 0) AS value, COUNT(*) AS count FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ?', ownerId, start, end);
  const payments = await db.getFirstAsync<{ value: number }>('SELECT COALESCE(SUM(amount_cents), 0) AS value FROM payments WHERE owner_id = ? AND created_at >= ? AND created_at < ?', ownerId, start, end);
  const credit = await db.getFirstAsync<{ value: number }>('SELECT COALESCE(SUM(amount_cents), 0) AS value FROM account_entries WHERE owner_id = ?', ownerId);
  const lowStock = await db.getFirstAsync<{ value: number }>('SELECT COUNT(*) AS value FROM products WHERE owner_id = ? AND is_active = 1 AND stock_quantity <= reorder_level', ownerId);
  const salesBySeller = await db.getAllAsync<{ sellerId: string | null; sellerName: string; totalCents: number; saleCount: number }>(`SELECT s.seller_id AS sellerId, COALESCE(se.name, 'Unassigned') AS sellerName, COALESCE(SUM(s.total_cents), 0) AS totalCents, COUNT(*) AS saleCount FROM sales s LEFT JOIN sellers se ON se.id = s.seller_id AND se.owner_id = s.owner_id WHERE s.owner_id = ? AND s.created_at >= ? AND s.created_at < ? GROUP BY s.seller_id, se.name ORDER BY totalCents DESC LIMIT 5`, ownerId, start, end);
  const salesByLocation = await db.getAllAsync<{ locationId: string | null; locationName: string; totalCents: number; saleCount: number }>(`SELECT s.location_id AS locationId, COALESCE(l.name, 'Unassigned') AS locationName, COALESCE(SUM(s.total_cents), 0) AS totalCents, COUNT(*) AS saleCount FROM sales s LEFT JOIN inventory_locations l ON l.id = s.location_id AND l.owner_id = s.owner_id WHERE s.owner_id = ? AND s.created_at >= ? AND s.created_at < ? GROUP BY s.location_id, l.name ORDER BY totalCents DESC LIMIT 5`, ownerId, start, end);
  return {
    salesTodayCents: sales?.value ?? 0,
    salesTodayCount: sales?.count ?? 0,
    paymentsTodayCents: payments?.value ?? 0,
    creditOutstandingCents: Math.max(0, credit?.value ?? 0),
    changeOwedOpenCents: await getOpenChangeOwedTotal(db, ownerId),
    lowStockCount: lowStock?.value ?? 0,
    salesBySeller,
    salesByLocation,
  };
}
