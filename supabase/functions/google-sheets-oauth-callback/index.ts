import { createClient } from 'npm:@supabase/supabase-js@2';
import { createSpreadsheet } from '../_shared/google-sheets.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const defaultRedirect = 'mamasshop://settings/reports';
const appRedirect = (connected: boolean, message?: string, returnUrl = defaultRedirect) => {
  const target = new URL(returnUrl);
  target.searchParams.set('connected', connected ? '1' : '0');
  if (message) target.searchParams.set('error', message);
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
};

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!state) return appRedirect(false, 'The Google response was incomplete. Return to the app and reconnect.');
  let returnUrl = defaultRedirect;
  try {
    const { data: pending, error: stateError } = await admin.from('google_sheets_oauth_states').select('state, owner_id, shop_name, return_url, expires_at').eq('state', state).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (stateError) {
      console.error('[google-sheets-oauth-callback] state lookup failed', { message: stateError.message, code: stateError.code });
      return appRedirect(false, 'Mama’s Shop could not validate the Google sign-in. Please return to the app and try again.');
    }
    if (!pending) return appRedirect(false, 'This sign-in link expired or was already used. Start a fresh connection in Mama’s Shop.');
    await admin.from('google_sheets_oauth_states').delete().eq('state', state);
    returnUrl = pending.return_url || defaultRedirect;
    if (url.searchParams.has('error')) return appRedirect(false, 'Google sign-in was cancelled or denied. Return to the app and try again when ready.', returnUrl);
    if (!code) return appRedirect(false, 'The Google response was incomplete. Return to the app and reconnect.', returnUrl);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!, redirect_uri: Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')!, grant_type: 'authorization_code' }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) throw new Error('Google did not return an offline access token. Reconnect and approve access when asked.');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.email) throw new Error('Mama’s Shop could not confirm the connected Google account.');
    const { data: existingConnection, error: connectionError } = await admin
      .from('google_sheets_connections')
      .select('connected_email, spreadsheet_id, spreadsheet_url')
      .eq('owner_id', pending.owner_id)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (existingConnection && existingConnection.connected_email.toLowerCase() !== String(profile.email).toLowerCase()) {
      throw new Error(`This shop is already linked to ${existingConnection.connected_email}. Choose that Google account to reconnect and keep using the existing spreadsheet.`);
    }

    const spreadsheet = existingConnection
      ? {
          spreadsheetId: existingConnection.spreadsheet_id,
          spreadsheetUrl: existingConnection.spreadsheet_url,
        }
      : await createSpreadsheet(
          tokens.access_token,
          pending.shop_name,
          await Deno.readFile(new URL('./app-icon.png', import.meta.url)),
        );
    const now = new Date().toISOString();
    const credentials = {
      connected_email: profile.email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      last_error: null,
      updated_at: now,
    };
    const saveResult = existingConnection
      ? await admin.from('google_sheets_connections').update(credentials).eq('owner_id', pending.owner_id)
      : await admin.from('google_sheets_connections').insert({
          owner_id: pending.owner_id,
          ...credentials,
          syncing_until: null,
          spreadsheet_id: spreadsheet.spreadsheetId,
          spreadsheet_url: spreadsheet.spreadsheetUrl,
        });
    const { error: saveError } = saveResult;
    if (saveError) throw saveError;
    return appRedirect(true, undefined, returnUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Google connection could not be completed.';
    console.error('[google-sheets-oauth-callback] connection failed', { message });
    return appRedirect(false, message, returnUrl);
  }
});
