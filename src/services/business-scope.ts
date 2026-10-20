import type { SQLiteDatabase } from 'expo-sqlite';

export async function persistBusinessScope(db: SQLiteDatabase, userId: string, businessId: string) {
  await db.runAsync('INSERT INTO business_scopes (user_id, business_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET business_id = excluded.business_id, updated_at = excluded.updated_at', userId, businessId, new Date().toISOString());
}
