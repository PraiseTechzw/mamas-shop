import { createClient } from 'npm:@supabase/supabase-js@2';
import { createSpreadsheet } from '../_shared/google-sheets.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const redirect = 'mamasshop://settings/reports';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const page = (message: string, success: boolean) => new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mama’s Shop</title><style>body{font-family:Arial,sans-serif;background:#f7f7fc;color:#202044;display:grid;place-items:center;min-height:90vh;margin:0}.card{background:white;padding:28px;border-radius:20px;max-width:380px;box-shadow:0 6px 30px #25205a12}h1{font-size:22px;color:#5b43d6}p{line-height:1.5}a{display:inline-block;padding:12px 18px;background:#5b43d6;border-radius:24px;color:white;text-decoration:none;font-weight:bold}</style></head><body><main class="card"><h1>${success ? 'Google Sheets connected' : 'Connection needs attention'}</h1><p>${escapeHtml(message)}</p><a href="${redirect}?connected=${success ? '1' : '0'}">Return to Mama’s Shop</a></main><script>setTimeout(()=>location.href=${JSON.stringify(`${redirect}?connected=${success ? '1' : '0'}`)},700)</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.has('error')) return page('Google sign-in was cancelled or denied. Return to the app and try again when ready.', false);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return page('The Google response was incomplete. Return to the app and reconnect.', false);
  try {
    const { data: pending, error: stateError } = await admin.from('google_sheets_oauth_states').select('state, owner_id, shop_name, expires_at').eq('state', state).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (stateError || !pending) throw new Error('This connection request expired. Please start again in the app.');
    await admin.from('google_sheets_oauth_states').delete().eq('state', state);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!, redirect_uri: Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')!, grant_type: 'authorization_code' }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) throw new Error('Google did not return an offline access token. Reconnect and approve access when asked.');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.email) throw new Error('Mama’s Shop could not confirm the connected Google account.');
    const logo = await Deno.readFile(new URL('./app-icon.png', import.meta.url));
    const spreadsheet = await createSpreadsheet(tokens.access_token, pending.shop_name, logo);
    const now = new Date().toISOString();
    const { error: saveError } = await admin.from('google_sheets_connections').upsert({ owner_id: pending.owner_id, connected_email: profile.email, spreadsheet_id: spreadsheet.spreadsheetId, spreadsheet_url: spreadsheet.spreadsheetUrl, refresh_token: tokens.refresh_token, access_token: tokens.access_token, access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(), syncing_until: null, last_error: null, updated_at: now }, { onConflict: 'owner_id' });
    if (saveError) throw saveError;
    return page(`Your formatted business workbook was created in ${profile.email}. You can return to the app now.`, true);
  } catch (error) {
    return page(error instanceof Error ? error.message : 'The Google connection could not be completed.', false);
  }
});
