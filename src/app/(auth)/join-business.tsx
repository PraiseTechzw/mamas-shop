import { useState } from 'react';
import { router } from 'expo-router';
import { Building2, Users } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { AppText, Card, Field, Page, PrimaryButton } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { joinBusiness } from '@/services/business-membership';

export default function JoinBusinessScreen() {
  const db = useSQLiteContext();
  const { session, setBusinessId } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError('');
    if (!session) { setError('Sign in or create your staff account first, then return here to enter the invitation code.'); return; }
    setBusy(true);
    try {
      const result = await joinBusiness(db, session.user.id, code);
      await setBusinessId(result.businessId);
      router.replace('/(tabs)');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not join this business. Check the code and try again.');
    } finally { setBusy(false); }
  };
  return <Page title="Join a business" subtitle="Use a private invitation code from the shop owner." back>
    <Card style={{ alignItems: 'center', gap: 11, paddingVertical: 24 }}>
      <Building2 size={32} stroke={colors.deepPurple}/>
      <AppText variant="heading">Work with your own sign-in</AppText>
      <AppText color={colors.secondary} style={{ textAlign: 'center' }}>Ask the owner to create an invitation in Settings → Team. Each staff member must use their own account.</AppText>
    </Card>
    <Card style={{ gap: 13 }}>
      <ViewRow />
      {!session ? <>
        <AppText color={colors.secondary}>Sign in or create an account first. You can return here after signing in and enter the code.</AppText>
        <PrimaryButton label="Go to sign in" onPress={() => router.replace('/(auth)/login')}/>
      </> : <>
        <AppText variant="small" color={colors.secondary}>Signed in as {session.user.email ?? 'staff account'}</AppText>
        <Field label="Invitation code" value={code} onChangeText={(value) => { setCode(value); setError(''); }} placeholder="Paste the full code" autoCapitalize="none" autoCorrect={false} />
        {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
        <PrimaryButton label="Join shop" loading={busy} onPress={() => void submit()} />
      </>}
    </Card>
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Users size={20} stroke={colors.deepPurple}/>
      <AppText variant="small" color={colors.secondary} style={{ flex: 1 }}>An invitation expires after 14 days and can be used by one account. Shop changes sync when this device is online.</AppText>
    </Card>
  </Page>;
}

function ViewRow() { return <AppText variant="heading">Enter your invitation</AppText>; }
