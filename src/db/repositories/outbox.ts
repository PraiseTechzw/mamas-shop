import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { requestSync } from '@/services/sync-events';

export async function enqueueChange(db: SQLiteDatabase, ownerId: string, entityType: string, entityId: string, operation: string, payload: unknown, now: string) {
  const id = Crypto.randomUUID();
  await db.runAsync(
    'INSERT INTO sync_outbox (id, owner_id, entity_type, entity_id, operation, payload_json, idempotency_key, created_at, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, ownerId, entityType, entityId, operation, JSON.stringify(payload), id, now, now,
  );
  requestSync();
}
