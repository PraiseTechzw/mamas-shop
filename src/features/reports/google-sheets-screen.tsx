import { AppText, Card, Page, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';
import { getShopSettings } from '@/db/repositories/settings';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/lib/supabase';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { BarChart3, CloudUpload, ExternalLink, FileSpreadsheet, History, Package, RefreshCw, ShieldCheck, ShoppingBag, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

type ConnectionStatus = { connected: boolean; connected_email?: string; spreadsheet_url?: string; last_synced_at?: string | null; last_error?: string | null };

async function getFunctionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const bodyText = await context.clone().text();
      try {
        const body = JSON.parse(bodyText) as { error?: unknown; message?: unknown };
        if (typeof body.error === 'string') return body.error;
        if (typeof body.message === 'string') return body.message;
      } catch { /* Use the SDK message when the response is not JSON. */ }
      if (bodyText.trim()) return bodyText;
      if (!context.ok) return `Google Sheets request failed (HTTP ${context.status}).`;
    }
  }
  return error instanceof Error ? error.message : 'Google Sheets request failed.';
}

export function GoogleSheetsReportsScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const params = useLocalSearchParams<{ connected?: string; error?: string }>();
  const ownerId = businessId ?? session?.user.id ?? '';
  const [shopName, setShopName] = useState("Mama's Shop");
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reconnectNeeded = Boolean(
    status.last_error && /refresh|reconnect|invalid_grant|token/i.test(status.last_error),
  );

  const load = useCallback(async () => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    try {
      const settings = await getShopSettings(db, ownerId);
      setShopName(settings.shop_name || "Mama's Shop");
      if (!supabase) {
        setStatus({ connected: false });
        return;
      }
      const { data, error } = await supabase.functions.invoke('google-sheets', { body: { action: 'status', ownerId } });
      if (error) throw error;
      setStatus(data as ConnectionStatus);
    } catch (error) {
      setMessage(await getFunctionErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [db, ownerId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (params.connected === '1' || params.connected === '0') {
      void Promise.resolve().then(async () => {
        if (params.connected === '0') {
          setMessage(typeof params.error === 'string' ? params.error : 'Google connection was cancelled. You can try again any time.');
          await load();
          return;
        }
        setMessage('Google Sheets is connected.');
        await load();
      });
    }
  }, [params.connected, params.error, load]);

  const connect = async () => {
    if (!supabase) { setMessage('Cloud sync is not configured for this app yet.'); return; }
    const reconnecting = status.connected;
    setBusy(true); setMessage('');
    try {
      const redirectUrl = ExpoLinking.createURL('settings/reports');
      const { data, error } = await supabase.functions.invoke('google-sheets', { body: { action: 'connect', ownerId, shopName, redirectUrl } });
      if (error) throw error;
      let deepLinkUrl: string | undefined;
      // On Android, the OAuth callback opens the app through this deep link.
      // Expo's Custom Tab stays visible unless we dismiss it when that link arrives.
      const subscription = Linking.addEventListener('url', ({ url }) => {
        if (url.startsWith(redirectUrl)) {
          deepLinkUrl = url;
          void WebBrowser.dismissBrowser();
        }
      });
      let result: Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;
      try {
        result = await WebBrowser.openAuthSessionAsync(data.authorizationUrl, redirectUrl);
      } finally {
        subscription.remove();
      }
      const returnedUrl = result.type === 'success' ? result.url : deepLinkUrl;
      if (returnedUrl) {
        const callbackUrl = new URL(returnedUrl);
        const connected = callbackUrl?.searchParams.get('connected');
        const callbackError = callbackUrl?.searchParams.get('error');
        if (connected !== '1') throw new Error(callbackError ?? 'Google sign-in did not complete. Start a new connection and finish the Google approval step.');
        setMessage('Google sign-in finished. Loading your spreadsheet…');
        await load();
        const syncResult = await supabase.functions.invoke('google-sheets', { body: { action: 'sync', ownerId } });
        if (syncResult.error) throw syncResult.error;
        setMessage(syncResult.data?.skipped
          ? syncResult.data.message ?? 'A spreadsheet update is already running.'
          : reconnecting
            ? 'Google is reconnected. Your existing spreadsheet has been updated.'
            : 'Your historical records are now in Google Sheets. New cloud-synced activity will be added automatically.');
        await load();
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        const { data: currentStatus, error: statusError } = await supabase.functions.invoke('google-sheets', { body: { action: 'status', ownerId } });
        if (statusError) throw statusError;
        if (currentStatus?.connected) {
          setStatus(currentStatus as ConnectionStatus);
          setMessage('Google connected. Uploading your shop history…');
          const syncResult = await supabase.functions.invoke('google-sheets', { body: { action: 'sync', ownerId } });
          if (syncResult.error) throw syncResult.error;
          setMessage(syncResult.data?.skipped
            ? syncResult.data.message ?? 'A spreadsheet update is already running.'
            : 'Google connected. Your spreadsheet has been updated with your shop history.');
          await load();
        } else {
          setMessage('Google did not return to Expo Go. If you approved access, deploy the updated Google Sheets functions and migration 202610210008, then restart Expo Go.');
        }
      }
    } catch (error) {
      setMessage(await getFunctionErrorMessage(error));
      await load();
    } finally { setBusy(false); }
  };

  const update = async () => {
    if (!supabase) {
      setMessage('Cloud sync is not configured for this app yet.');
      return;
    }
    setBusy(true);
    setMessage('Updating the spreadsheet from your synced shop history…');
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets', { body: { action: 'sync', ownerId } });
      if (error) throw error;
      if (!data || typeof data !== 'object') throw new Error('Google Sheets returned an unexpected update response.');
      setMessage(data.skipped
        ? data.message ?? 'A spreadsheet update is already running.'
        : `Spreadsheet updated from ${data.synced ?? 0} business events.`);
      await load();
    } catch (error) {
      setMessage(await getFunctionErrorMessage(error));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => Alert.alert('Disconnect Google Sheets?', 'Automatic updates will stop. Your spreadsheet and its existing records will stay in Google Drive.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Disconnect', style: 'destructive', onPress: () => { void (async () => {
      if (!supabase) {
        setMessage('Cloud sync is not configured for this app yet.');
        return;
      }
      setBusy(true);
      try {
        const { error } = await supabase.functions.invoke('google-sheets', { body: { action: 'disconnect', ownerId } });
        if (error) throw error;
        setMessage('Google Sheets disconnected. The spreadsheet remains in your Drive.');
        await load();
      } catch (error) {
        setMessage(await getFunctionErrorMessage(error));
      } finally {
        setBusy(false);
      }
    })(); } },
  ]);

  return <Page title="Reports & Sheets" subtitle="Review your business history and keep a Google Sheet updated." back>
    <Card style={{ gap: 10 }}>
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint"><FileSpreadsheet size={24} color={colors.deepPurple} /></View>
        <View className="flex-1 gap-1"><AppText variant="heading">{shopName} business book</AppText><StatusBadge label={loading ? 'Checking connection' : reconnectNeeded ? 'Reconnect needed' : status.connected ? 'Google connected' : 'Not connected'} tone={status.connected && !reconnectNeeded ? 'green' : 'amber'} /></View>
      </View>
      <AppText color={colors.secondary} style={{ lineHeight: 21 }}>The workbook has a branded overview and searchable tabs for sales, stock, payments, customers, and the full event history. Each row keeps its original record ID and date.</AppText>
      {status.connected ? <View className="gap-2 rounded-2xl bg-brand-tint p-3">
        <AppText variant="label">Connected account</AppText><AppText color={colors.deepPurple}>{status.connected_email}</AppText>
        {status.last_synced_at ? <AppText variant="small" color={colors.secondary}>Last update · {new Date(status.last_synced_at).toLocaleString()}</AppText> : null}
        {status.last_error ? (
          <View className="gap-1 rounded-xl bg-danger/10 p-3">
            <AppText variant="label" color={colors.danger}>
              {reconnectNeeded ? 'Reconnect Google to continue' : 'The last update needs attention'}
            </AppText>
            <AppText variant="small" color={colors.danger} style={{ lineHeight: 18 }}>
              {status.last_error}
            </AppText>
            {reconnectNeeded ? (
              <AppText variant="small" color={colors.secondary} style={{ lineHeight: 18 }}>
                Sign in to the same Google account to keep using this spreadsheet. Existing records will remain in Drive.
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View> : <View className="rounded-2xl bg-brand-tint p-3"><AppText variant="small" color={colors.deepPurple} style={{ lineHeight: 19 }}>Connect the Google account where you want your business spreadsheet saved. The workbook stays in that account’s Drive.</AppText></View>}
      {status.connected && status.spreadsheet_url ? <SecondaryButton label="Open business spreadsheet" onPress={() => void Linking.openURL(status.spreadsheet_url!)} icon={<ExternalLink size={17} color={colors.deepPurple} />} /> : null}
      {status.connected ? (
        <PrimaryButton
          label={busy ? (reconnectNeeded ? 'Reconnecting…' : 'Updating…') : reconnectNeeded ? 'Reconnect Google' : 'Update spreadsheet now'}
          onPress={() => void (reconnectNeeded ? connect() : update())}
          loading={busy}
          icon={reconnectNeeded
            ? <CloudUpload size={17} color={colors.surface} />
            : <RefreshCw size={17} color={colors.surface} />}
        />
      ) : <PrimaryButton label={busy ? 'Connecting…' : 'Connect Google Sheets'} onPress={() => void connect()} loading={busy || loading} icon={<CloudUpload size={17} color={colors.surface} />} />}
      {status.connected ? <Pressable onPress={disconnect} disabled={busy} className="items-center py-2"><AppText variant="small" color={colors.danger}>Disconnect Google Sheets</AppText></Pressable> : null}
      {message ? <AppText variant="small" color={colors.secondary} style={{ lineHeight: 19 }}>{message}</AppText> : null}
    </Card>
    <View className="gap-3">
      <AppText variant="heading">What your workbook includes</AppText>
      <ReportLine icon={BarChart3} title="Weekly and all-time overview" detail="Sales totals, sale counts, outstanding credit, and stock activity." />
      <ReportLine icon={ShoppingBag} title="Sales by item and seller" detail="Each product on a sale, quantity, price, receipt, customer, seller, and location." />
      <ReportLine icon={Package} title="Stock history" detail="Stock received, adjustments, transfers, costs, dates, and reasons." />
      <ReportLine icon={FileSpreadsheet} title="Products and expenses" detail="Product profile changes, opening quantities, prices, costs, and recorded expenses." />
      <ReportLine icon={Users} title="Customer and payment history" detail="Customer profile changes, credit repayments, payment methods, and recorded amounts." />
      <ReportLine icon={History} title="Earlier records" detail="The initial upload includes historical events already synced to the shop cloud. New activity appears after it syncs from the app." />
    </View>
    <Card style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
      <ShieldCheck size={19} color={colors.purple} />
      <View className="flex-1 gap-1"><AppText variant="label">Your business data</AppText><AppText variant="small" color={colors.secondary} style={{ lineHeight: 19 }}>Google stores a copy in the connected account’s Drive. Anyone you share that spreadsheet with can see its business records. The app sends records only after cloud sync confirms them.</AppText></View>
    </Card>
  </Page>;
}

function ReportLine({ icon: Icon, title, detail }: { icon: typeof BarChart3; title: string; detail: string }) {
  return <View className="flex-row items-start gap-3 rounded-2xl border border-line bg-surface p-3">
    <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-tint"><Icon size={17} color={colors.deepPurple} /></View>
    <View className="flex-1 gap-0.5"><AppText variant="label">{title}</AppText><AppText variant="small" color={colors.secondary} style={{ lineHeight: 18 }}>{detail}</AppText></View>
  </View>;
}
