import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { Seller } from '@/db/schema';
import { enqueueChange } from './outbox';

export function listSellers(db: SQLiteDatabase, ownerId: string) {
  return db.getAllAsync<Seller>('SELECT id, owner_id, name, phone, is_owner, is_active FROM sellers WHERE owner_id = ? AND is_active = 1 ORDER BY is_owner DESC, name COLLATE NOCASE', ownerId);
}

export async function ensureOwnerSeller(db: SQLiteDatabase, ownerId: string, name: string) {
  const existing = await db.getFirstAsync<Seller>('SELECT id, owner_id, name, phone, is_owner, is_active FROM sellers WHERE owner_id = ? AND is_owner = 1', ownerId);
  if (existing) return existing;
  const id = ownerId;
  const now = new Date().toISOString();
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT OR IGNORE INTO sellers (id, owner_id, name, is_owner, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)', id, ownerId, name.trim() || 'Shop owner', now, now);
      await enqueueChange(db, ownerId, 'seller', id, 'seller.create', { id, name: name.trim() || 'Shop owner', is_owner: true, created_at: now }, now);
    });
  } catch {
    // Another screen may have created the owner's seller record at the same time.
  }
  const seller = await db.getFirstAsync<Seller>('SELECT id, owner_id, name, phone, is_owner, is_active FROM sellers WHERE owner_id = ? AND is_owner = 1', ownerId);
  if (!seller) throw new Error('Could not create the owner seller profile.');
  return seller;
}

export async function createSeller(db: SQLiteDatabase, ownerId: string, name: string, phone = '') {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Enter the seller’s name.');
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO sellers (id, owner_id, name, phone, is_owner, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, ?, ?)', id, ownerId, cleanName, phone.trim() || null, now, now);
      await enqueueChange(db, ownerId, 'seller', id, 'seller.create', { id, name: cleanName, phone: phone.trim() || null, is_owner: false, created_at: now }, now);
      await db.runAsync("INSERT INTO audit_log (id, owner_id, action, entity_type, entity_id, description, created_at) VALUES (?, ?, 'CREATE', 'seller', ?, ?, ?)", Crypto.randomUUID(), ownerId, id, 'Added seller ' + cleanName, now);
    });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) throw new Error('A seller with that name already exists.');
    throw error;
  }
  return id;
}
