import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/lib/supabase';
import { applyRemoteEvent, type RemoteSyncEvent } from '@/services/apply-remote-event';

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

export type SyncResult = { synced: number; downloaded: number; pending: number; failed: number; conflicts: number; lastSyncedAt?: string | null; unavailable?: 'not-configured' | 'signed-out' };

const BATCH_SIZE = 50;

function describeSyncError(error: unknown) {
  if (typeof error === 'string') return error.slice(0, 500);
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const message = typeof value.message === 'string'
      ? value.message
      : error instanceof Error ? error.message : '';
    const code = typeof value.code === 'string' ? `Code: ${value.code}` : '';
    const details = typeof value.details === 'string' ? value.details : '';
    const hint = typeof value.hint === 'string' ? `Hint: ${value.hint}` : '';
    const description = [message, code, details, hint].filter(Boolean).join(' · ');
    if (description) return description.slice(0, 500);
    if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 500);
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return 'Sync failed with an unreadable error object.';
    }
  }
  return 'Sync failed.';
}

/** Local tables that carry a sync_state column, keyed by outbox entity type. Table names are static literals. */
const SYNCED_STATE_TABLES: Record<string, string> = {
  sale: 'sales',
  payment: 'payments',
  expense: 'expenses',
  stock_movement: 'stock_movements',
  change_owed: 'change_owed',
};

export async function getSyncRetryDelay(db: SQLiteDatabase, ownerId: string): Promise<number> {
  const row = await db.getFirstAsync<{ next_attempt_at: string | null }>(
    'SELECT MIN(next_attempt_at) AS next_attempt_at FROM sync_outbox WHERE owner_id = ? AND last_error IS NOT NULL', ownerId,
  );
  if (!row?.next_attempt_at) return 1_000;
  return Math.max(1_000, Date.parse(row.next_attempt_at) - Date.now());
}

/** Uploads immutable, idempotent change events. Local records remain authoritative on this device. */
export async function syncOutbox(db: SQLiteDatabase, ownerId: string, force = false): Promise<SyncResult> {
  if (!supabase) return { synced: 0, downloaded: 0, pending: 0, failed: 0, conflicts: 0, unavailable: 'not-configured' };
  if (!ownerId) return { synced: 0, downloaded: 0, pending: 0, failed: 0, conflicts: 0, unavailable: 'signed-out' };

  const { data: { session }, error: authError } = await supabase.auth.getSession();
  if (authError || !session) return { synced: 0, downloaded: 0, pending: 0, failed: 0, conflicts: 0, unavailable: 'signed-out' };

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
        actor_id: session.user.id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        operation: row.operation,
        payload,
        occurred_at: row.created_at,
      }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
      if (error) throw error;

      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM sync_outbox WHERE id = ? AND owner_id = ?', row.id, ownerId);
        const syncedColumn = SYNCED_STATE_TABLES[row.entity_type];
        if (syncedColumn) await db.runAsync(`UPDATE ${syncedColumn} SET sync_state = 'SYNCED' WHERE id = ? AND owner_id = ?`, row.entity_id, ownerId);
      });
      synced += 1;
    } catch (error) {
      const attempt = row.attempt_count + 1;
      const delayMs = Math.min(60 * 60 * 1000, 5_000 * 2 ** Math.min(attempt - 1, 10));
      const retryAt = new Date(Date.now() + delayMs).toISOString();
      const message = describeSyncError(error);
      console.error('[sync] Upload failed', {
        operation: row.operation,
        entityType: row.entity_type,
        idempotencyKey: row.idempotency_key,
        attempt,
        error,
        errorMessage: message,
      });
      await db.runAsync('UPDATE sync_outbox SET attempt_count = ?, last_error = ?, next_attempt_at = ? WHERE id = ? AND owner_id = ?', attempt, message, retryAt, row.id, ownerId);
      failed += 1;
    }
  }

  let downloaded = 0;
  let pullFailed = false;
  try {
    downloaded = await pullRemoteEvents(db, ownerId);
  } catch (error) {
    // A failed read never advances the cursor; the next online retry safely fetches the same page.
    console.error('[sync] Could not fetch remote changes', error);
    pullFailed = true;
  }

  const pending = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_id = ?', ownerId);
  const failedRows = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_id = ? AND last_error IS NOT NULL', ownerId);
  const conflicts = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_conflicts WHERE owner_id = ? AND resolved_at IS NULL', ownerId);
  const lastSyncedAt = synced ? new Date().toISOString() : (await db.getFirstAsync<{ last_synced_at: string | null }>('SELECT last_synced_at FROM sync_metadata WHERE owner_id = ?', ownerId))?.last_synced_at ?? null;
  if (synced) await db.runAsync('INSERT INTO sync_metadata (owner_id, last_synced_at) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET last_synced_at = excluded.last_synced_at', ownerId, lastSyncedAt);
  return { synced, downloaded, pending: pending?.count ?? 0, failed: (failedRows?.count ?? failed) + (pullFailed ? 1 : 0), conflicts: conflicts?.count ?? 0, lastSyncedAt };
}

async function pullRemoteEvents(db: SQLiteDatabase, ownerId: string) {
  if (!supabase) return 0;
  const cursor = await db.getFirstAsync<{ last_pulled_at: string | null; last_pulled_key: string | null }>('SELECT last_pulled_at, last_pulled_key FROM sync_metadata WHERE owner_id = ?', ownerId);
  let receivedAt = cursor?.last_pulled_at ?? null;
  let cursorKey = cursor?.last_pulled_key ?? null;
  let downloaded = 0;
  while (true) {
    let request = supabase.from('sync_events').select('idempotency_key, owner_id, entity_type, entity_id, operation, payload, occurred_at, received_at').eq('owner_id', ownerId).order('received_at', { ascending: true }).order('idempotency_key', { ascending: true }).limit(BATCH_SIZE);
    if (receivedAt && cursorKey) request = request.or(`received_at.gt.${receivedAt},and(received_at.eq.${receivedAt},idempotency_key.gt.${cursorKey})`);
    else if (receivedAt) request = request.gt('received_at', receivedAt);
    const { data, error } = await request;
    if (error) throw error;
    const events = (data ?? []) as RemoteSyncEvent[];
    if (!events.length) break;
    for (const event of events) {
      const applied = await db.getFirstAsync('SELECT idempotency_key FROM sync_applied_events WHERE idempotency_key = ? AND owner_id = ?', event.idempotency_key, ownerId);
      if (applied) {
        receivedAt = event.received_at;
        cursorKey = event.idempotency_key;
        continue;
      }
      try {
        await db.withTransactionAsync(async () => {
          await applyRemoteEvent(db, event);
          await db.runAsync('INSERT OR IGNORE INTO sync_applied_events (idempotency_key, owner_id, applied_at) VALUES (?, ?, ?)', event.idempotency_key, ownerId, new Date().toISOString());
          await db.runAsync('INSERT INTO sync_metadata (owner_id, last_pulled_at, last_pulled_key) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET last_pulled_at = excluded.last_pulled_at, last_pulled_key = excluded.last_pulled_key', ownerId, event.received_at, event.idempotency_key);
        });
        downloaded += 1;
      } catch (value) {
        const description = value instanceof Error ? value.message.slice(0, 500) : 'Remote change could not be applied safely.';
        console.warn('[sync] Incoming change deferred for review', {
          operation: event.operation,
          entityType: event.entity_type,
          idempotencyKey: event.idempotency_key,
          error: description,
        });
        await db.withTransactionAsync(async () => {
          await db.runAsync('INSERT OR IGNORE INTO sync_conflicts (idempotency_key, owner_id, description, created_at, payload_json) VALUES (?, ?, ?, ?, ?)', event.idempotency_key, ownerId, description, new Date().toISOString(), JSON.stringify(event));
          await db.runAsync('INSERT OR IGNORE INTO sync_applied_events (idempotency_key, owner_id, applied_at) VALUES (?, ?, ?)', event.idempotency_key, ownerId, new Date().toISOString());
          await db.runAsync('INSERT INTO sync_metadata (owner_id, last_pulled_at, last_pulled_key) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET last_pulled_at = excluded.last_pulled_at, last_pulled_key = excluded.last_pulled_key', ownerId, event.received_at, event.idempotency_key);
        });
      }
      receivedAt = event.received_at;
      cursorKey = event.idempotency_key;
    }
    if (events.length < BATCH_SIZE) break;
  }
  // A sale or stock event can arrive before the product, customer, seller, or
  // location it references. Retry deferred events after the full pull so later
  // events in this batch can satisfy those dependencies automatically.
  await retrySyncConflicts(db, ownerId);
  return downloaded;
}

export async function retrySyncConflicts(db: SQLiteDatabase, ownerId: string) {
  const rows = await db.getAllAsync<{ idempotency_key: string; payload_json: string }>('SELECT idempotency_key, payload_json FROM sync_conflicts WHERE owner_id = ? AND resolved_at IS NULL ORDER BY created_at', ownerId);
  let resolved = 0;
  for (const row of rows) {
    try {
      const event = JSON.parse(row.payload_json) as RemoteSyncEvent;
      await db.withTransactionAsync(async () => {
        await applyRemoteEvent(db, event);
        await db.runAsync('UPDATE sync_conflicts SET resolved_at = ? WHERE idempotency_key = ? AND owner_id = ?', new Date().toISOString(), row.idempotency_key, ownerId);
      });
      resolved += 1;
    } catch {
      // Keep the conflict visible until the user has addressed the underlying stock or setup issue.
    }
  }
  return resolved;
}
