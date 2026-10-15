import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/lib/supabase';

type OutboxRow = {
  id: string;
  owner_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload_json: string;
  idempotency_key: string;
  created_at: string;
  attempt_count: number;
};

export type SyncResult = { synced: number; pending: number; failed: number; lastSyncedAt?: string | null; unavailable?: 'not-configured' | 'signed-out' };

const BATCH_SIZE = 50;

export async function getSyncRetryDelay(db: SQLiteDatabase, ownerId: string): Promise<number> {
  const row = await db.getFirstAsync<{ next_attempt_at: string | null }>(
    'SELECT MIN(next_attempt_at) AS next_attempt_at FROM sync_outbox WHERE owner_id = ? AND last_error IS NOT NULL', ownerId,
  );
  if (!row?.next_attempt_at) return 1_000;
  return Math.max(1_000, Date.parse(row.next_attempt_at) - Date.now());
}

/** Uploads immutable, idempotent change events. Local records remain authoritative on this device. */
export async function syncOutbox(db: SQLiteDatabase, ownerId: string, force = false): Promise<SyncResult> {
  if (!supabase) return { synced: 0, pending: 0, failed: 0, unavailable: 'not-configured' };
  if (!ownerId) return { synced: 0, pending: 0, failed: 0, unavailable: 'signed-out' };

  const { data: { session }, error: authError } = await supabase.auth.getSession();
  if (authError || session?.user.id !== ownerId) return { synced: 0, pending: 0, failed: 0, unavailable: 'signed-out' };

  const now = new Date().toISOString();
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT id, owner_id, entity_type, entity_id, operation, payload_json, idempotency_key, created_at, attempt_count FROM sync_outbox WHERE owner_id = ? AND (${force ? '1 = 1' : 'next_attempt_at IS NULL OR next_attempt_at <= ?'}) ORDER BY created_at LIMIT ?`,
    ...(force ? [ownerId, BATCH_SIZE] : [ownerId, now, BATCH_SIZE]),
  );
  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload: unknown = JSON.parse(row.payload_json);
      const { error } = await supabase.from('sync_events').upsert({
        idempotency_key: row.idempotency_key,
        owner_id: row.owner_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        operation: row.operation,
        payload,
        occurred_at: row.created_at,
      }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
      if (error) throw error;

      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM sync_outbox WHERE id = ? AND owner_id = ?', row.id, ownerId);
        if (row.entity_type === 'sale') await db.runAsync("UPDATE sales SET sync_state = 'SYNCED' WHERE id = ? AND owner_id = ?", row.entity_id, ownerId);
      });
      synced += 1;
    } catch (error) {
      const attempt = row.attempt_count + 1;
      const delayMs = Math.min(60 * 60 * 1000, 5_000 * 2 ** Math.min(attempt - 1, 10));
      const retryAt = new Date(Date.now() + delayMs).toISOString();
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Sync failed.';
      await db.runAsync('UPDATE sync_outbox SET attempt_count = ?, last_error = ?, next_attempt_at = ? WHERE id = ? AND owner_id = ?', attempt, message, retryAt, row.id, ownerId);
      failed += 1;
    }
  }

  const pending = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_id = ?', ownerId);
  const failedRows = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_id = ? AND last_error IS NOT NULL', ownerId);
  const lastSyncedAt = synced ? new Date().toISOString() : (await db.getFirstAsync<{ last_synced_at: string | null }>('SELECT last_synced_at FROM sync_metadata WHERE owner_id = ?', ownerId))?.last_synced_at ?? null;
  if (synced) await db.runAsync('INSERT INTO sync_metadata (owner_id, last_synced_at) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET last_synced_at = excluded.last_synced_at', ownerId, lastSyncedAt);
  return { synced, pending: pending?.count ?? 0, failed: failedRows?.count ?? failed, lastSyncedAt };
}
