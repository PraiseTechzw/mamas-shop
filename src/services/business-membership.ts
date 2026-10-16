import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/lib/supabase';
import { syncOutbox } from '@/services/sync-engine';

export async function persistBusinessScope(db: SQLiteDatabase, userId: string, businessId: string) {
  await db.runAsync('INSERT INTO business_scopes (user_id, business_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET business_id = excluded.business_id, updated_at = excluded.updated_at', userId, businessId, new Date().toISOString());
}

export async function createBusinessInvite(code: string, businessName: string, inviteeEmail = '') {
  if (!supabase) throw new Error('Connect this app to Supabase before creating a business invitation.');
  const { data, error } = await supabase.rpc('create_business_invite', {
    p_code: code,
    p_business_name: businessName,
    p_invitee_email: inviteeEmail.trim() || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invite_id || !row?.expires_at) throw new Error('The invitation could not be created.');
  return { id: String(row.invite_id), expiresAt: String(row.expires_at) };
}

export async function joinBusiness(db: SQLiteDatabase, userId: string, code: string) {
  if (!supabase) throw new Error('Connect this app to Supabase before accepting an invitation.');
  const cleanCode = code.trim().toLowerCase();
  if (cleanCode.length < 32) throw new Error('Enter the full invitation code from the shop owner.');

  const personalRecords = await db.getFirstAsync<{ count: number }>(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM sales WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM customers WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM expenses WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM inventory_locations WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM stock_movements WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM payments WHERE owner_id = ?) +
      (SELECT COUNT(*) FROM account_entries WHERE owner_id = ?) AS count
  `, userId, userId, userId, userId, userId, userId, userId, userId);
  if ((personalRecords?.count ?? 0) > 0) throw new Error('This login already has shop records. Use a new staff login so its existing business data stays separate.');
  const pending = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_id = ?', userId);
  if ((pending?.count ?? 0) > 0) throw new Error('Sync this login’s pending changes before joining another business.');

  const { data, error } = await supabase.rpc('join_business_with_code', { p_code: cleanCode });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.owner_id) throw new Error('The invitation could not be accepted.');
  const businessId = String(row.owner_id);
  await persistBusinessScope(db, userId, businessId);
  // Load the shop's event archive before the app opens its business screens.
  // The owner-scoped RLS policy permits this only after the membership RPC succeeds.
  const sync = await syncOutbox(db, businessId, true);
  // The invitation code is one-use and already consumed, so a partial download
  // must not send the staff member through the join flow again. The scope is
  // persisted and the sync engine keeps retrying in the background.
  const warning = sync.failed > 0
    ? 'Your membership is active, but some shop data could not download yet. The app keeps retrying in the background; stay online until sync completes.'
    : '';
  return { businessId, businessName: String(row.business_name ?? 'Shop'), warning };
}
