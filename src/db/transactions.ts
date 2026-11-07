import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

type TransactionTask = (transaction: SQLiteDatabase) => Promise<void>;

const transactionQueues = new WeakMap<SQLiteDatabase, Promise<void>>();

export async function withDatabaseTransaction(db: SQLiteDatabase, task: TransactionTask) {
  const previous = transactionQueues.get(db) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  transactionQueues.set(db, current);
  await previous;

  try {
    if (Platform.OS === 'web') {
      await db.withTransactionAsync(() => task(db));
    } else {
      await db.withExclusiveTransactionAsync(task);
    }
  } finally {
    release();
    if (transactionQueues.get(db) === current) transactionQueues.delete(db);
  }
}
