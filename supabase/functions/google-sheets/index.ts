import { createClient } from 'npm:@supabase/supabase-js@2';
import { appendUniqueRows, createSpreadsheet, eventRows, type GoogleEvent } from '../_shared/google-sheets.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-scheduler-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function configured() {
  const names = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'];
  const missing = names.filter((name) => !Deno.env.get(name));
  if (missing.length) throw new Error(`Google Sheets is not configured on the server (${missing.join(', ')}).`);
}

async function getUser(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

async function accessToken(connection: { access_token: string | null; access_token_expires_at: string | null; refresh_token: string }) {
  if (connection.access_token && connection.access_token_expires_at && Date.parse(connection.access_token_expires_at) > Date.now() + 60_000) return connection.access_token;
  configured();
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!, refresh_token: connection.refresh_token, grant_type: 'refresh_token' }) });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Google could not refresh the connection. Please reconnect the spreadsheet.');
  const expiresAt = new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000).toISOString();
  await admin.from('google_sheets_connections').update({ access_token: data.access_token, access_token_expires_at: expiresAt, updated_at: new Date().toISOString(), last_error: null }).eq('owner_id', (connection as { owner_id?: string }).owner_id ?? '');
  return data.access_token as string;
}

async function syncOwner(ownerId: string) {
  const { data: connection, error } = await admin.from('google_sheets_connections').select('*').eq('owner_id', ownerId).maybeSingle();
  if (error) throw error;
  if (!connection) return { skipped: true, connected: false, message: 'Connect Google Sheets before syncing reports.' };
  const until = new Date(Date.now() + 10 * 60_000).toISOString();
  const { data: locked, error: lockError } = await admin.from('google_sheets_connections').update({ syncing_until: until }).eq('owner_id', ownerId).or(`syncing_until.is.null,syncing_until.lt.${new Date().toISOString()}`).select('owner_id').maybeSingle();
  if (lockError) throw lockError;
  if (!locked) return { skipped: true, message: 'A spreadsheet update is already running.' };
  try {
    const token = await accessToken(connection);
    const all: GoogleEvent[] = [];
    for (let from = 0; ; from += 1000) {
      let query = admin.from('sync_events').select('idempotency_key, owner_id, entity_type, entity_id, operation, payload, occurred_at, received_at, actor_id').eq('owner_id', ownerId).order('received_at', { ascending: true }).order('idempotency_key', { ascending: true });
      if (connection.cursor_received_at && connection.cursor_key) query = query.or(`received_at.gt.${connection.cursor_received_at},and(received_at.eq.${connection.cursor_received_at},idempotency_key.gt.${connection.cursor_key})`);
      const { data, error: eventError } = await query.range(from, from + 999);
      if (eventError) throw eventError;
      const page = (data ?? []) as GoogleEvent[];
      all.push(...page);
      if (page.length < 1000) break;
    }
    const lookups = { customers: new Map<string, string>(), sellers: new Map<string, string>(), products: new Map<string, string>(), locations: new Map<string, string>() };
    const profileEvents: GoogleEvent[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: profileError } = await admin.from('sync_events').select('idempotency_key, owner_id, entity_type, entity_id, operation, payload, occurred_at, received_at, actor_id').eq('owner_id', ownerId).in('operation', ['customer.create', 'customer.update', 'seller.create', 'product.create', 'product.update', 'location.create']).order('received_at', { ascending: true }).range(from, from + 999);
      if (profileError) throw profileError;
      const page = (data ?? []) as GoogleEvent[];
      profileEvents.push(...page);
      if (page.length < 1000) break;
    }
    for (const event of profileEvents) {
      const payload = event.payload ?? {};
      const id = String(payload.id ?? event.entity_id);
      if (event.operation.startsWith('customer.')) lookups.customers.set(id, String(payload.name ?? ''));
      if (event.operation === 'seller.create') lookups.sellers.set(id, String(payload.name ?? ''));
      if (event.operation.startsWith('product.')) lookups.products.set(id, String(payload.name ?? ''));
      if (event.operation === 'location.create') lookups.locations.set(id, String(payload.name ?? ''));
    }
    const grouped = new Map<string, unknown[][]>();
    for (const event of all) {
      for (const [sheet, rows] of Object.entries(eventRows(event, lookups))) {
        grouped.set(sheet, [...(grouped.get(sheet) ?? []), ...rows]);
      }
    }
    for (const [sheet, rows] of grouped) await appendUniqueRows(token, connection.spreadsheet_id, sheet, rows);
    const now = new Date().toISOString();
    const last = all.at(-1);
    const { error: updateError } = await admin.from('google_sheets_connections').update({ syncing_until: null, cursor_received_at: last?.received_at ?? connection.cursor_received_at, cursor_key: last?.idempotency_key ?? connection.cursor_key, last_synced_at: now, last_error: null, updated_at: now }).eq('owner_id', ownerId);
    if (updateError) throw updateError;
    return { synced: all.length, spreadsheetUrl: connection.spreadsheet_url, lastSyncedAt: now };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheets update failed.';
    await admin.from('google_sheets_connections').update({ syncing_until: null, last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('owner_id', ownerId);
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  let action: unknown = null;
  let step = 'parse-request';
  try {
    const body = await request.json().catch(() => ({}));
    action = body.action ?? null;
    if (body.action === 'scheduled-sync') {
      const expected = Deno.env.get('GOOGLE_SHEETS_SCHEDULER_SECRET');
      if (!expected || request.headers.get('x-scheduler-secret') !== expected) return json({ error: 'Unauthorized scheduler.' }, 401);
      const { data: connections, error } = await admin.from('google_sheets_connections').select('owner_id');
      if (error) throw error;
      const results = [];
      for (const row of connections ?? []) {
        try { results.push({ ownerId: row.owner_id, ...(await syncOwner(row.owner_id)) }); }
        catch (reason) { results.push({ ownerId: row.owner_id, error: reason instanceof Error ? reason.message : 'Sync failed.' }); }
      }
      return json({ results });
    }
    step = 'authenticate-user';
    const user = await getUser(request);
    if (!user) return json({ error: 'Sign in to Mama’s Shop first.' }, 401);
    step = 'verify-shop-owner';
    const ownerId = typeof body.ownerId === 'string' ? body.ownerId : user.id;
    if (ownerId !== user.id) return json({ error: 'Only the shop owner can connect its Google Sheet.' }, 403);

    if (body.action === 'connect') {
      step = 'check-google-configuration';
      configured();
      const shopName = typeof body.shopName === 'string' ? body.shopName : "Mama's Shop";
      const state = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`;
      step = 'save-oauth-state';
      const { error } = await admin.from('google_sheets_oauth_states').insert({ state, owner_id: ownerId, shop_name: typeof body.shopName === 'string' ? body.shopName : "Mama's Shop", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() });
      if (error) throw error;
      step = 'build-google-authorization-url';
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!, redirect_uri: Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')!, response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, login_hint: user.email ?? '' }).toString();
      return json({ authorizationUrl: url.toString(), shopName });
    }
    if (body.action === 'status') {
      step = 'read-connection-status';
      const { data, error } = await admin.from('google_sheets_connections').select('connected_email, spreadsheet_url, last_synced_at, last_error').eq('owner_id', ownerId).maybeSingle();
      if (error) throw error;
      return json({ connected: Boolean(data), ...data });
    }
    if (body.action === 'disconnect') {
      step = 'remove-google-connection';
      const { error } = await admin.from('google_sheets_connections').delete().eq('owner_id', ownerId);
      if (error) throw error;
      return json({ disconnected: true });
    }
    if (body.action === 'sync') {
      step = 'sync-workbook';
      return json(await syncOwner(ownerId));
    }
    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    const details = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof details.message === 'string'
          ? details.message
          : 'Google Sheets operation failed.';
    console.error('[google-sheets] request failed', {
      action,
      step,
      message,
      code: details.code,
      details: details.details,
      hint: details.hint,
      error: error instanceof Error ? error.stack : JSON.stringify(error),
    });
    return json({ error: message }, 400);
  }
});
