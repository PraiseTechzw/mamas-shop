import { useState } from 'react';
import { Image, ImageBackground, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Mail, LockKeyhole, Eye, EyeOff, ArrowRight } from 'lucide-react-native';
import { colors, radius } from '@/constants/theme';
import { AppText, Card, Field, PrimaryButton, SecondaryButton } from '@/components/ui/primitives';
import { useAuth } from './auth-context';
import { supabase } from '@/lib/supabase';

const logo = require('@/assets/images/brand/app-icon.png');
const storefront = require('@/assets/images/marketing/storefront-promo.png');

export function WelcomeScreen() {
  return <ScrollView className="flex-1 bg-canvas" contentContainerStyle={styles.welcome}>
    <View style={styles.brandRow}><Image source={logo} style={styles.logo} /><View><AppText variant="heading">Mama’s Shop</AppText><AppText variant="small" color={colors.secondary}>Your family shop, made simpler</AppText></View></View>
    <View style={styles.hero}><Image source={storefront} resizeMode="cover" style={styles.heroImage} /></View>
    <View style={{ gap: 10 }}><AppText variant="title">Small business. Big dreams.</AppText><AppText color={colors.secondary} style={{ lineHeight: 23 }}>Keep sales, payments and customer credit clear, even when the day gets busy.</AppText></View>
    <View style={{ gap: 12, marginTop: 6 }}><PrimaryButton label="Get started" onPress={() => router.push('/(auth)/login')} icon={<ArrowRight size={18} color="#fff" />} /><SecondaryButton label="I already have an account · Log in" onPress={() => router.push('/(auth)/login')} /></View>
    <View style={styles.country}><AppText variant="small" color={colors.secondary}>Made for Zimbabwean family businesses · USD</AppText></View>
  </ScrollView>;
}

export function LoginScreen() {
  const { configured } = useAuth();
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError(''); setNotice('');
    if (!email.trim() || !password) { setError('Enter your email and password to continue.'); return; }
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (!supabase) { setError('The app is not connected yet. Add the Supabase URL and publishable key to your local .env file.'); return; }
    setBusy(true);
    try {
      if (creating) {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
        if (authError) throw authError;
        if (data.session) router.replace('/(tabs)');
        else setNotice('Check your email to confirm your account, then log in here.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        router.replace('/(tabs)');
      }
    } catch (value) { setError(value instanceof Error ? value.message : 'We could not sign you in. Please try again.'); }
    finally { setBusy(false); }
  };
  const forgotPassword = async () => {
    setError(''); setNotice('');
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    if (!supabase) { setError('Add the Supabase connection details to your local .env file first.'); return; }
    setBusy(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (authError) setError(authError.message); else setNotice('If an account exists for this email, a reset link is on its way.');
  };
  return <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.loginPage}>
    <Pressable onPress={() => router.back()}><AppText variant="label" color={colors.purple}>‹  Back</AppText></Pressable>
    <View style={styles.loginBrand}><Image source={logo} style={styles.loginLogo} /><AppText variant="title">{creating ? 'Create your account' : 'Welcome back'}</AppText><AppText color={colors.secondary} style={{ textAlign: 'center', lineHeight: 22 }}>{creating ? 'Set up your sign-in to manage your shop.' : 'Sign in to see how your shop is doing today.'}</AppText></View>
    <Card style={{ gap: 14 }}>
      {creating ? <Field label="Your name" placeholder="e.g. Mama" autoCapitalize="words" value={fullName} onChangeText={setFullName} returnKeyType="next" /> : null}
      <Field label="Email address" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} returnKeyType="next" />
      <View><Field label="Password" placeholder="At least 8 characters" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} onSubmitEditing={submit} returnKeyType="go" /><Pressable hitSlop={10} onPress={() => setShowPassword((value) => !value)} style={styles.passwordEye}>{showPassword ? <EyeOff size={19} color={colors.secondary} /> : <Eye size={19} color={colors.secondary} />}</Pressable></View>
      {!creating ? <Pressable onPress={forgotPassword} disabled={busy} style={{ alignSelf: 'flex-end' }}><AppText variant="small" color={colors.purple}>Forgot password?</AppText></Pressable> : null}
      {error ? <View style={styles.errorBox}><AppText variant="small" color={colors.danger}>{error}</AppText></View> : null}
      {notice ? <View style={styles.noticeBox}><AppText variant="small" color={colors.success}>{notice}</AppText></View> : null}
      <PrimaryButton label={creating ? 'Create account' : 'Log in'} loading={busy} onPress={submit} />
      {!configured ? <AppText variant="small" color={colors.warning} style={{ lineHeight: 18 }}>Sign-in needs your Supabase project connection. Your local data remains on this device until sync is configured.</AppText> : null}
    </Card>
    <View style={styles.switchRow}><AppText color={colors.secondary}>{creating ? 'Already have an account?' : 'New to Mama’s Shop?'}</AppText><Pressable onPress={() => { setCreating((value) => !value); setError(''); setNotice(''); }}><AppText variant="label" color={colors.purple}>{creating ? 'Log in' : 'Create account'}</AppText></Pressable></View>
    <AppText variant="small" color={colors.secondary} style={{ textAlign: 'center', lineHeight: 18 }}>Your account is protected. We never store your password in this app.</AppText>
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  welcome: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 38, paddingBottom: 28, gap: 22 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 54, height: 54, borderRadius: 16 },
  hero: { height: 245, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.lavenderTint },
  heroImage: { width: '100%', height: '100%' },
  country: { alignItems: 'center', marginTop: 3 },
  loginPage: { flexGrow: 1, padding: 24, paddingTop: 22, paddingBottom: 32, gap: 22, justifyContent: 'center' },
  loginBrand: { alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  loginLogo: { width: 70, height: 70, borderRadius: 22, marginBottom: 4 },
  passwordEye: { position: 'absolute', right: 14, top: 34, height: 48, justifyContent: 'center' },
  errorBox: { borderRadius: 12, padding: 12, backgroundColor: '#FCEBED' },
  noticeBox: { borderRadius: 12, padding: 12, backgroundColor: '#E7F5EF' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
});
