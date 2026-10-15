import type { SQLiteDatabase } from 'expo-sqlite';
export type ReportSummary = { sales: number; received: number; credit: number; expenses: number; cost: number; profit: number; count: number };
export async function getReportSummary(db: SQLiteDatabase, ownerId: string, start: string, end: string): Promise<ReportSummary> {
 const sales = await db.getFirstAsync<{ total: number; paid: number; balance: number; count: number }>('SELECT COALESCE(SUM(total_cents),0) total, COALESCE(SUM(paid_cents),0) paid, COALESCE(SUM(balance_cents),0) balance, COUNT(*) count FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ?', ownerId,start,end);
 const expenses = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount_cents),0) total FROM expenses WHERE owner_id = ? AND spent_at >= ? AND spent_at < ?',ownerId,start,end);
 const cost = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(si.quantity * si.unit_cost_cents),0) total FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.owner_id = ? AND s.created_at >= ? AND s.created_at < ?',ownerId,start,end);
 const salesTotal=sales?.total??0; const costTotal=cost?.total??0; const expenseTotal=expenses?.total??0;
 return { sales:salesTotal, received:sales?.paid??0, credit:sales?.balance??0, expenses:expenseTotal, cost:costTotal, profit:salesTotal-costTotal-expenseTotal, count:sales?.count??0 };
}
export async function salesByDay(db: SQLiteDatabase, ownerId: string, start: string, end: string) { return db.getAllAsync<{ day: string; amount: number; count: number }>(`SELECT substr(created_at,1,10) day, SUM(total_cents) amount, COUNT(*) count FROM sales WHERE owner_id = ? AND created_at >= ? AND created_at < ? GROUP BY substr(created_at,1,10) ORDER BY day DESC`,ownerId,start,end); }
export async function salesByPaymentMethod(db: SQLiteDatabase, ownerId: string, start: string, end: string) { return db.getAllAsync<{ method: string; amount: number; count: number }>(`SELECT method, SUM(amount_cents) amount, COUNT(*) count FROM payments WHERE owner_id = ? AND kind = 'SALE' AND created_at >= ? AND created_at < ? GROUP BY method ORDER BY amount DESC`,ownerId,start,end); }
export async function bestSellers(db: SQLiteDatabase, ownerId: string, start: string, end: string) { return db.getAllAsync<{ name: string; quantity: number; amount: number }>(`SELECT si.product_name name, SUM(si.quantity) quantity, SUM(si.line_total_cents) amount FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.owner_id = ? AND s.created_at >= ? AND s.created_at < ? GROUP BY si.product_name ORDER BY amount DESC LIMIT 20`,ownerId,start,end); }
export type SalesDimensionRow = { id: string | null; name: string; amount: number; count: number };
export async function salesByLocation(db: SQLiteDatabase, ownerId: string, start: string, end: string) {
 return db.getAllAsync<SalesDimensionRow>(`SELECT s.location_id AS id, COALESCE(l.name, 'Unassigned') AS name, SUM(s.total_cents) AS amount, COUNT(*) AS count FROM sales s LEFT JOIN inventory_locations l ON l.id = s.location_id AND l.owner_id = s.owner_id WHERE s.owner_id = ? AND s.created_at >= ? AND s.created_at < ? GROUP BY s.location_id, l.name ORDER BY amount DESC`, ownerId, start, end);
}
export async function salesBySeller(db: SQLiteDatabase, ownerId: string, start: string, end: string) {
 return db.getAllAsync<SalesDimensionRow>(`SELECT s.seller_id AS id, COALESCE(se.name, 'Unassigned') AS name, SUM(s.total_cents) AS amount, COUNT(*) AS count FROM sales s LEFT JOIN sellers se ON se.id = s.seller_id AND se.owner_id = s.owner_id WHERE s.owner_id = ? AND s.created_at >= ? AND s.created_at < ? GROUP BY s.seller_id, se.name ORDER BY amount DESC`, ownerId, start, end);
}
