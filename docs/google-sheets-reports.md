# Google Sheets business reports

The Reports & Sheets screen connects the shop owner’s Google account to a formatted workbook. Google OAuth refresh tokens stay in a server-only table and are read only by the Supabase Edge Functions. The mobile app never receives those tokens.

The workbook contains:

- **Overview** — branded header and live weekly/all-time formulas.
- **Weekly Summary** — sales totals and units grouped by week.
- **Seller Summary** — all-time and current-week sales totals by seller.
- **Sales** — one row per item sold, with receipt, date, price, payment/credit, customer, seller, and location.
- **Stock** — opening quantities, received stock, count adjustments, transfers, costs, and notes.
- **Products** — product profile changes, selling prices, costs, and reorder levels.
- **Expenses** — expenses recorded in the business event history.
- **Payments** — customer repayments and change-owed activity.
- **Customers** — customer profile creation and update history.
- **Events** — the original cloud event ID, actor, timestamp, and full event payload for audit/reference.

The first sync backfills the business events already in `sync_events`; later app syncs trigger a Sheets refresh. The scheduled function can also refresh the workbook while the app is closed. Local-only events are uploaded to Supabase by the app first, then become eligible for the report. This relies on the existing sync history; events that were never uploaded to Supabase and are no longer available on a device cannot be reconstructed.

## Google and Supabase setup

1. In Google Cloud, enable the Google Sheets API and Google Drive API. Configure an OAuth consent screen and create a **Web application** OAuth client.
2. Set its authorized redirect URI to `https://<project-ref>.supabase.co/functions/v1/google-sheets-oauth-callback`.
3. Apply all Supabase migrations, including `202610210006_google_sheets_reports.sql`.
4. Set the following **Supabase Edge Function secrets**. Do not put the Google client secret in the app `.env` or source control:

   ```sh
   supabase secrets set \
     GOOGLE_OAUTH_CLIENT_ID='your-web-client-id' \
     GOOGLE_OAUTH_CLIENT_SECRET='your-web-client-secret' \
     GOOGLE_OAUTH_REDIRECT_URI='https://<project-ref>.supabase.co/functions/v1/google-sheets-oauth-callback' \
     GOOGLE_SHEETS_SCHEDULER_SECRET='a-long-random-secret'
   ```

5. Deploy both functions:

   ```sh
   supabase functions deploy google-sheets
   supabase functions deploy google-sheets-oauth-callback
   ```

6. Enable `pg_cron` and `pg_net` for the Supabase project, then store the project URL and a publishable key in Supabase Vault. The app’s existing publishable key may be used here; never use a service-role key in cron SQL.

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'mamas_shop_project_url');
   select vault.create_secret('<publishable-key>', 'mamas_shop_publishable_key');
   ```

7. Schedule the server refresh every 15 minutes. Replace the secret literal with the same value configured as `GOOGLE_SHEETS_SCHEDULER_SECRET` in Supabase Edge Function secrets:

   ```sql
   select cron.schedule(
     'mamas-shop-google-sheets-refresh',
     '*/15 * * * *',
     $$
       select net.http_post(
         url := (select decrypted_secret from vault.decrypted_secrets where name = 'mamas_shop_project_url') || '/functions/v1/google-sheets',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'mamas_shop_publishable_key'),
           'x-scheduler-secret', '<same-long-random-secret>'
         ),
         body := '{"action":"scheduled-sync"}'::jsonb,
         timeout_milliseconds := 10000
       );
     $$
   );
   ```

8. Deploy the app with its normal Supabase URL and publishable key. In **Settings → Reports & Google Sheets**, choose **Connect Google Sheets** and select `praisetechzw@gmail.com` in Google’s account picker.

## Expo Go, production deep links, and EAS builds

The app scheme is `mamasshop`. Installed builds use links such as `mamasshop://settings/reports` and `mamasshop://reset-password`. Expo Go creates temporary `exp://` links, so use a development build to test the production OAuth and password-reset return paths. In Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**, allow `mamasshop://settings/reports` and `mamasshop://reset-password`. During Expo Go testing, add the exact `exp://…/--/settings/reports` and `exp://…/--/reset-password` URLs shown by the running dev session; those addresses can change when the session restarts.

EAS Build does not read the developer’s local `.env` file. Set these values in the EAS project’s **development**, **preview**, and **production** environments (or at minimum the environments whose builds need backend access):

```sh
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value 'https://<project-ref>.supabase.co' --environment production --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value '<publishable-key>' --environment production --visibility plaintext
```

Repeat with `--environment development` and `--environment preview` and the appropriate project values. These `EXPO_PUBLIC_` values are embedded in the app and are public client configuration; never put a service-role key, Google client secret, scheduler secret, or OAuth refresh token in an `EXPO_PUBLIC_` variable. Store Google credentials and the scheduler secret only as Supabase Edge Function secrets as described above. The `eas.json` build profiles select their matching EAS environment.

Before release, apply migrations through `202610210008_google_sheets_oauth_return_url.sql`, deploy both Edge Functions (including the callback’s bundled `app-icon.png`), confirm the Supabase Auth redirect allow-list and Google OAuth redirect URI match exactly, and run a fresh connection from an installed development/production build. The callback URL registered with Google remains the Supabase URL; `mamasshop://…` is the app’s return link after the server has exchanged Google’s authorization code.

The iOS bundle identifier and Android package are both `com.praisetechzw04.mamasshop`. Register that identifier with the relevant store accounts and complete EAS signing credentials before store submission. Preview and production builds can be built with `npx eas-cli@latest build --profile preview` and `npx eas-cli@latest build --profile production`; these commands use cloud build minutes and are intentionally not run as part of local checks.

The connection action creates the workbook and uploads available history immediately. Each row is keyed by the source event ID so retrying a sync does not intentionally add the same business record twice. The scheduled refresh also picks up any data uploaded to the cloud after the initial connection.

## Workbook access and privacy

The logo image is placed in the connected Google Drive and made viewable to anyone with its link so Google Sheets can render the logo in the workbook header. The workbook itself remains owned by the connected Google account and follows that account’s sharing permissions. It includes customer names and phone numbers present in customer history events, so share the workbook only with people allowed to see those records.
