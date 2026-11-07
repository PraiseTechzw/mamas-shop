import type { SQLiteDatabase } from 'expo-sqlite';
import { hasLocalShopData } from '@/db/repositories/settings';
import { withDatabaseTransaction } from '@/db/transactions';

export async function persistBusinessScope(db: SQLiteDatabase, userId: string, businessId: string) {
  await withDatabaseTransaction(db, async (transaction) => {
    const latest = await transaction.getFirstAsync<{ updated_at: string | null }>(
      'SELECT MAX(updated_at) AS updated_at FROM business_scopes',
    );
    const latestTime = latest?.updated_at ? Date.parse(latest.updated_at) : 0;
    const updatedAt = new Date(
      Math.max(Date.now(), Number.isFinite(latestTime) ? latestTime + 1 : 0),
    ).toISOString();
    await transaction.runAsync(
      'INSERT INTO business_scopes (user_id, business_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET business_id = excluded.business_id, updated_at = excluded.updated_at',
      userId,
      businessId,
      updatedAt,
    );
  });
}

export async function getOfflineBusinessScope(db: SQLiteDatabase) {
  const scope = await db.getFirstAsync<{ user_id: string; business_id: string }>(
    'SELECT user_id, business_id FROM business_scopes ORDER BY updated_at DESC LIMIT 1',
  );
  if (!scope || !(await hasLocalShopData(db, scope.business_id))) return null;
  return scope;
}
