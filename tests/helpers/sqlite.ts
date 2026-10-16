import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/db/migrations';

type Bindable = string | number | bigint | null | Uint8Array;

function normalize(params: unknown[]): Bindable[] {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value as Bindable;
  });
}

function plain<T>(row: Record<string, unknown> | undefined): T | null {
  if (row === undefined || row === null) return null;
  return { ...row } as T;
}

/**
 * Mirrors the subset of expo-sqlite's SQLiteDatabase API used by the
 * repositories so business SQL can run against node:sqlite in tests.
 */
export function createTestDatabase(handle = new DatabaseSync(':memory:')) {
  const db = {
    handle,
    async execAsync(sql: string) {
      handle.exec(sql);
    },
    async runAsync(sql: string, ...params: unknown[]) {
      const result = handle.prepare(sql).run(...normalize(params)) as unknown as { changes: number | bigint; lastInsertRowId?: number | bigint; lastInsertRowid?: number | bigint };
      return { lastInsertRowId: Number(result.lastInsertRowId ?? result.lastInsertRowid ?? 0), changes: Number(result.changes) };
    },
    async getAllAsync<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      return handle.prepare(sql).all(...normalize(params)).map((row: Record<string, unknown>) => ({ ...row }) as unknown as T);
    },
    async getFirstAsync<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | null> {
      return plain<T>(handle.prepare(sql).get(...normalize(params)) as Record<string, unknown> | undefined);
    },
    async withTransactionAsync(body: () => Promise<void>) {
      handle.exec('BEGIN');
      try {
        await body();
        handle.exec('COMMIT');
      } catch (error) {
        handle.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      handle.close();
    },
  };
  return db;
}

export type TestDatabase = ReturnType<typeof createTestDatabase>;

/** Applies the full local migration chain, exactly like SQLiteProvider's onInit. */
export async function openMigratedDatabase(): Promise<{ db: SQLiteDatabase; raw: TestDatabase }> {
  const raw = createTestDatabase();
  await migrateDbIfNeeded(raw as unknown as SQLiteDatabase);
  return { db: raw as unknown as SQLiteDatabase, raw };
}

export async function readVersion(db: TestDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}
