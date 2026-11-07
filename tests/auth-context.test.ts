import { createElement } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { openMigratedDatabase } from './helpers/sqlite';
import { persistBusinessScope } from '@/services/business-scope';

type AuthEventListener = (event: string, session: unknown) => void;
type TestBindValue = string | number | boolean | null | Uint8Array;

let mockDatabase: SQLiteDatabase;
let mockAuthEventListener: AuthEventListener | null = null;
const mockGetSession = jest.fn();
const mockCheckConnection = jest.fn().mockResolvedValue('offline');
const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
const mockOnAuthStateChange = jest.fn((listener: AuthEventListener) => {
  mockAuthEventListener = listener;
  return { data: { subscription: { unsubscribe: jest.fn() } } };
});

jest.doMock('expo-sqlite', () => ({
  useSQLiteContext: () => mockDatabase,
}));
jest.doMock('@/lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
    rpc: mockRpc,
  },
}));
jest.doMock('@/lib/format', () => ({ setAppCurrency: jest.fn() }));
jest.doMock('@/lib/network', () => ({ checkConnection: mockCheckConnection }));

const { AuthProvider, useAuth } = require('@/features/auth/auth-context') as typeof import('@/features/auth/auth-context');

let observedAuth: ReturnType<typeof useAuth> | null = null;

function AuthObserver() {
  observedAuth = useAuth();
  return null;
}

async function mountAuthProvider() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(createElement(AuthProvider, null, createElement(AuthObserver)));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

async function unmount(root: ReactTestRenderer) {
  await act(async () => {
    root.unmount();
  });
}

async function seedSavedShop() {
  const { db, raw } = await openMigratedDatabase();
  await persistBusinessScope(db, 'saved-account', 'saved-shop');
  await raw.runAsync(
    'INSERT INTO shop_settings (owner_id, shop_name, currency, low_stock_alerts, updated_at) VALUES (?, ?, ?, ?, ?)',
    'saved-shop',
    'Mama’s Shop',
    'USD',
    1,
    '2026-10-15T10:00:00.000Z',
  );
  return { db, raw };
}

function prepareTest() {
  mockAuthEventListener = null;
  mockGetSession.mockReset();
  mockCheckConnection.mockReset().mockResolvedValue('offline');
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockOnAuthStateChange.mockClear();
  observedAuth = null;
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

test('restores a saved shop when Supabase cannot restore the persisted session', async () => {
  prepareTest();
  const { db, raw } = await seedSavedShop();
  mockDatabase = db;
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: new Error('Refresh token expired'),
  });

  const root = await mountAuthProvider();

  expect(observedAuth).toMatchObject({
    userId: 'saved-account',
    businessId: 'saved-shop',
    offlineAccess: true,
    session: null,
    loading: false,
  });

  await unmount(root);
  raw.close();
});

test('keeps a restored Supabase session active when the device is offline', async () => {
  prepareTest();
  const { db, raw } = await seedSavedShop();
  mockDatabase = db;
  const session = { user: { id: 'saved-account' } };
  mockGetSession.mockResolvedValue({
    data: { session },
    error: null,
  });
  mockCheckConnection.mockResolvedValue('offline');

  const root = await mountAuthProvider();

  expect(observedAuth).toMatchObject({
    userId: 'saved-account',
    businessId: 'saved-shop',
    offlineAccess: false,
    session,
    loading: false,
  });

  await unmount(root);
  raw.close();
});

test('restores a saved shop when there is no session and the device is offline', async () => {
  prepareTest();
  const { db, raw } = await seedSavedShop();
  mockDatabase = db;
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  mockCheckConnection.mockResolvedValue('offline');

  const root = await mountAuthProvider();

  expect(observedAuth).toMatchObject({
    userId: 'saved-account',
    businessId: 'saved-shop',
    offlineAccess: true,
    session: null,
    loading: false,
  });

  await unmount(root);
  raw.close();
});

test('does not restore a saved shop when there is no session but the device is online', async () => {
  prepareTest();
  const { db, raw } = await seedSavedShop();
  mockDatabase = db;
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  mockCheckConnection.mockResolvedValue('online');

  const root = await mountAuthProvider();

  expect(observedAuth).toMatchObject({
    userId: null,
    businessId: null,
    offlineAccess: false,
    session: null,
    loading: false,
  });

  await unmount(root);
  raw.close();
});

test('keeps a sign-in event received while checking offline access', async () => {
  prepareTest();
  const { db, raw } = await seedSavedShop();
  mockDatabase = db;
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  let resolveConnection!: (connection: 'online' | 'offline' | 'checking') => void;
  mockCheckConnection.mockReturnValue(new Promise((resolve) => { resolveConnection = resolve; }));

  const root = await mountAuthProvider();
  const session = { user: { id: 'newly-signed-in' } };

  await act(async () => {
    mockAuthEventListener?.('SIGNED_IN', session);
    resolveConnection('online');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(observedAuth).toMatchObject({
    userId: 'newly-signed-in',
    offlineAccess: false,
    session,
    loading: false,
  });

  await unmount(root);
  raw.close();
});

test('keeps an INITIAL_SESSION when session lookup fails afterward', async () => {
  prepareTest();
  const { db, raw } = await seedSavedShop();
  await persistBusinessScope(db, 'active-account', 'saved-shop');
  mockDatabase = db;
  const session = { user: { id: 'active-account' } };
  let rejectSession!: (error: Error) => void;
  mockGetSession.mockReturnValue(new Promise((_, reject) => { rejectSession = reject; }));

  const root = await mountAuthProvider();

  await act(async () => {
    mockAuthEventListener?.('INITIAL_SESSION', session);
    rejectSession(new Error('Refresh token expired'));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  expect(observedAuth).toMatchObject({
    userId: 'active-account',
    offlineAccess: false,
    session,
    loading: false,
  });

  await unmount(root);
  await new Promise((resolve) => setTimeout(resolve, 10));
  raw.close();
});

test('does not restore local access after an explicit sign-out during session recovery', async () => {
  prepareTest();
  const { db, raw } = await seedSavedShop();
  let releaseScopeRead!: () => void;
  let scopeReadStarted!: () => void;
  const scopeRead = new Promise<void>((resolve) => { scopeReadStarted = resolve; });
  const releaseRead = new Promise<void>((resolve) => { releaseScopeRead = resolve; });
  mockDatabase = {
    ...db,
    async getFirstAsync<T>(sql: string, ...params: TestBindValue[]) {
      if (sql.startsWith('SELECT user_id, business_id FROM business_scopes')) {
        scopeReadStarted();
        await releaseRead;
      }
      return db.getFirstAsync<T>(sql, ...params);
    },
  } as SQLiteDatabase;
  mockGetSession.mockRejectedValue(new Error('Refresh token expired'));

  const root = await mountAuthProvider();
  await scopeRead;

  await act(async () => {
    mockAuthEventListener?.('SIGNED_OUT', null);
    releaseScopeRead();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(observedAuth).toMatchObject({
    userId: null,
    businessId: null,
    offlineAccess: false,
    session: null,
    loading: false,
  });

  await unmount(root);
  raw.close();
});
