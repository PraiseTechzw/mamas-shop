import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { enqueueChange } from './outbox';
export type ShopSettings = { shop_name: string; currency: string; low_stock_alerts: number };
export type SetupDraft = { shop_name: string; currency: string; mode: 'create' | 'join'; selected_owner_id: string | null };
export async function getSetupDraft(db: SQLiteDatabase, userId: string) {
 return db.getFirstAsync<SetupDraft>('SELECT shop_name, currency, mode, selected_owner_id FROM setup_drafts WHERE user_id = ?', userId);
}
export async function saveSetupDraft(db: SQLiteDatabase, userId: string, draft: SetupDraft) {
 await db.runAsync(
  `INSERT INTO setup_drafts (user_id, shop_name, currency, mode, selected_owner_id, updated_at)
   VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET shop_name = excluded.shop_name,
   currency = excluded.currency, mode = excluded.mode, selected_owner_id = excluded.selected_owner_id, updated_at = excluded.updated_at`,
  userId, draft.shop_name, draft.currency, draft.mode, draft.selected_owner_id, new Date().toISOString(),
 );
}
export async function clearSetupDraft(db: SQLiteDatabase, userId: string) {
 await db.runAsync('DELETE FROM setup_drafts WHERE user_id = ?', userId);
}
export async function getShopSettings(db: SQLiteDatabase, ownerId: string) { return (await db.getFirstAsync<ShopSettings>('SELECT shop_name, currency, low_stock_alerts FROM shop_settings WHERE owner_id = ?', ownerId)) ?? { shop_name: '', currency: 'USD', low_stock_alerts: 1 }; }
export async function needsShopSetup(db: SQLiteDatabase, ownerId: string) {
  if (!ownerId) return false;
  const row = await db.getFirstAsync<{ named: number }>(
    "SELECT COUNT(*) AS named FROM shop_settings WHERE owner_id = ? AND TRIM(shop_name) <> ''",
    ownerId,
  );
  return (row?.named ?? 0) === 0;
}
export async function hasLocalShopData(db: SQLiteDatabase, ownerId: string) {
  if (!ownerId) return false;
  const row = await db.getFirstAsync<{ records: number }>(`
    SELECT
      (SELECT COUNT(*) FROM shop_settings WHERE owner_id = ? AND TRIM(shop_name) <> '') +
      (SELECT COUNT(*) FROM products WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM sales WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM customers WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM payments WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM stock_movements WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM expenses WHERE owner_id = ?) AS records
  `, ownerId, ownerId, ownerId, ownerId, ownerId, ownerId, ownerId);
  return (row?.records ?? 0) > 0;
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
