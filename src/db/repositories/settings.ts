import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { enqueueChange } from './outbox';
export type ShopSettings = { shop_name: string; currency: string; low_stock_alerts: number };
export async function getShopSettings(db: SQLiteDatabase, ownerId: string) { return (await db.getFirstAsync<ShopSettings>('SELECT shop_name, currency, low_stock_alerts FROM shop_settings WHERE owner_id = ?', ownerId)) ?? { shop_name: '', currency: 'USD', low_stock_alerts: 1 }; }
export async function needsShopSetup(db: SQLiteDatabase, ownerId: string) {
  if (!ownerId) return false;
  const row = await db.getFirstAsync<{ named: number; records: number }>(`
    SELECT (SELECT COUNT(*) FROM shop_settings WHERE owner_id = ? AND TRIM(shop_name) <> '') AS named,
      (SELECT COUNT(*) FROM products WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM sales WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM customers WHERE owner_id = ?) AS records
  `, ownerId, ownerId, ownerId, ownerId);
  return (row?.named ?? 0) === 0 && (row?.records ?? 0) === 0;
}
export async function saveShopSettings(db: SQLiteDatabase, ownerId: string, name: string, currency: string, alerts: boolean) {
 const updatedAt = new Date().toISOString();
 await db.withTransactionAsync(async () => {
  await db.runAsync('INSERT INTO shop_settings (owner_id, shop_name, currency, low_stock_alerts, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET shop_name = excluded.shop_name, currency = excluded.currency, low_stock_alerts = excluded.low_stock_alerts, updated_at = excluded.updated_at', ownerId, name.trim(), currency, alerts ? 1 : 0, updatedAt);
  await db.runAsync("INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'UPDATE', 'settings', ?, ?, ?)", Crypto.randomUUID(), ownerId, ownerId, 'Updated shop settings', updatedAt);
  await enqueueChange(db, ownerId, 'shop_settings', ownerId, 'settings.update', { shop_name: name.trim(), currency, low_stock_alerts: alerts, updated_at: updatedAt }, updatedAt);
 });
}
export async function getSyncSummary(db: SQLiteDatabase, ownerId: string) { return db.getFirstAsync<{ pending: number; failed: number; conflicts: number }>(`SELECT (SELECT COUNT(*) FROM sync_outbox WHERE owner_id = ?) AS pending, (SELECT COUNT(*) FROM sync_outbox WHERE owner_id = ? AND last_error IS NOT NULL) AS failed, (SELECT COUNT(*) FROM sync_conflicts WHERE owner_id = ? AND resolved_at IS NULL) AS conflicts`, ownerId, ownerId, ownerId); }
