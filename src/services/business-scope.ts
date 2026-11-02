import type { SQLiteDatabase } from 'expo-sqlite';
import { hasLocalShopData } from '@/db/repositories/settings';

export async function persistBusinessScope(db: SQLiteDatabase, userId: string, businessId: string) {
  await db.runAsync('INSERT INTO business_scopes (user_id, business_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET business_id = excluded.business_id, updated_at = excluded.updated_at', userId, businessId, new Date().toISOString());
}

export async function getOfflineBusinessScope(db: SQLiteDatabase) {
  const scope = await db.getFirstAsync<{ user_id: string; business_id: string }>(
    'SELECT user_id, business_id FROM business_scopes ORDER BY updated_at DESC LIMIT 1',
  );
  if (!scope || !(await hasLocalShopData(db, scope.business_id))) return null;
  return scope;
}
