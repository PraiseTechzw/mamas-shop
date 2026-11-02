import { openMigratedDatabase } from './helpers/sqlite';
import { getOfflineBusinessScope, persistBusinessScope } from '@/services/business-scope';

test('offline access only restores the latest account scope when its shop has local data', async () => {
  const { db, raw } = await openMigratedDatabase();
  await persistBusinessScope(db, 'account-without-shop', 'empty-shop');
  await persistBusinessScope(db, 'shop-owner', 'saved-shop');
  await raw.runAsync(
    'INSERT INTO shop_settings (owner_id, shop_name, currency, low_stock_alerts, updated_at) VALUES (?, ?, ?, ?, ?)',
    'saved-shop',
    'Mama’s Shop',
    'USD',
    1,
    '2026-10-15T10:00:00.000Z',
  );

  await persistBusinessScope(db, 'account-without-shop', 'empty-shop');

  await expect(getOfflineBusinessScope(db)).resolves.toBeNull();
  await persistBusinessScope(db, 'shop-owner', 'saved-shop');
  await expect(getOfflineBusinessScope(db)).resolves.toEqual({
    user_id: 'shop-owner',
    business_id: 'saved-shop',
  });
});
