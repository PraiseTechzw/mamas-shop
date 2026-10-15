import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { AppText, Card, Field, Page, PrimaryButton } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export function PasswordRecoveryScreen() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const authCode = Array.isArray(code) ? code[0] : code;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setError('Password recovery is unavailable until Supabase is configured.');
      return () => { active = false; };
    }
    if (!authCode) {
      setError('This password reset link is missing or has expired. Request a new one from the login screen.');
      return () => { active = false; };
    }
    void supabase.auth.exchangeCodeForSession(authCode).then(({ error: exchangeError }) => {
      if (!active) return;
      if (exchangeError) setError('This password reset link has expired. Request a new one from the login screen.');
      else setReady(true);
    }).catch(() => {
      if (active) setError('We could not verify this reset link. Request a new one from the login screen.');
    });
    return () => { active = false; };
  }, [authCode]);

  const save = async () => {
    setError('');
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    if (!supabase) { setError('Password recovery is unavailable until Supabase is configured.'); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace('/(tabs)');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Your password could not be updated. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <Page title="Choose a new password" subtitle="Set a new password for your Mama’s Shop account." back>
    <Card style={styles.card}>
      {!ready && !error ? <View style={styles.waiting}><ActivityIndicator color={colors.purple}/><AppText color={colors.secondary}>Verifying your reset link…</AppText></View> : null}
      {ready ? <>
        <Field label="New password" placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" icon={<LockKeyhole size={17} color={colors.secondary}/>}/>
        <Field label="Confirm new password" placeholder="Enter the password again" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" icon={<LockKeyhole size={17} color={colors.secondary}/>}/>
        {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
        <PrimaryButton label="Update password" loading={busy} onPress={()=>void save()}/>
      </> : null}
      {!ready && error ? <>
        <AppText color={colors.danger}>{error}</AppText>
        <PrimaryButton label="Return to log in" onPress={()=>router.replace('/(auth)/login')}/>
      </> : null}
    </Card>
  </Page>;
}

const styles = StyleSheet.create({ card: { gap: 14 }, waiting: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 12 } });
