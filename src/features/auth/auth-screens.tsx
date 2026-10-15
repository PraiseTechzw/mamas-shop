import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { AppText, Field } from '@/components/ui/primitives';
import { useAuth } from './auth-context';
import { supabase } from '@/lib/supabase';

const logo = require('@/assets/images/brand/cart-mark.png');
const storefront = require('@/assets/images/marketing/storefront-hero.png');

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return <View style={styles.brandBlock}>
    <Image source={logo} style={[styles.logo, compact && styles.smallLogo]} accessibilityLabel="Mama’s Shop shopping cart logo" />
    <AppText variant="heading" style={styles.brandName}>Mama’s Shop</AppText>
    <AppText variant="small" color={colors.deepPurple} style={styles.brandTagline}>Small Business · Big Dreams</AppText>
    {!compact ? <AppText variant="small" color={colors.secondary} style={styles.brandPromise}>Quality products · Fair prices · Serving our community</AppText> : null}
  </View>;
}

function AuthButton({ label, onPress, variant = 'primary', loading = false }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary'; loading?: boolean }) {
  const primary = variant === 'primary';
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={loading} style={({ pressed }) => [styles.buttonTouchArea, pressed && !loading && styles.buttonPressed]}>
    <View style={[styles.authButton, primary ? styles.primaryAction : styles.secondaryAction, loading && styles.buttonDisabled]}>
      {loading ? <ActivityIndicator size="small" color={primary ? '#FFFFFF' : colors.purple} /> : <AppText variant="label" color={primary ? '#FFFFFF' : colors.deepPurple} style={styles.actionLabel}>{label}</AppText>}
    </View>
  </Pressable>;
}

function ZimbabweFooter() {
  return <View style={styles.country}><AppText variant="small" color={colors.secondary}>🇿🇼  Proudly Zimbabwean</AppText></View>;
}

export function WelcomeScreen() {
  return <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={styles.welcome}>
      <BrandHeader />
      <View style={styles.hero}>
        <Image source={storefront} resizeMode="cover" style={styles.heroImage} accessibilityLabel="Mama’s Shop family grocery storefront" />
      </View>
      <View style={styles.welcomeActions}>
        <AuthButton label="Get Started" onPress={() => router.push('/(auth)/login')} />
        <AuthButton label="Log In" variant="secondary" onPress={() => router.push('/(auth)/login')} />
      </View>
      <ZimbabweFooter />
    </ScrollView>
  </SafeAreaView>;
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
    setError('');
    setNotice('');
    if (!email.trim() || !password) { setError('Enter your email and password to continue.'); return; }
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (creating && !fullName.trim()) { setError('Enter your name to create an account.'); return; }
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
    } catch (value) {
      setError(value instanceof Error ? value.message : 'We could not sign you in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    if (!supabase) { setError('Add the Supabase connection details to your local .env file first.'); return; }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (authError) setError(authError.message);
      else setNotice('If an account exists for this email, a reset link is on its way.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'We could not send a password reset link. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView className="flex-1 bg-canvas" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.loginPage}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to welcome screen" onPress={() => router.replace('/(auth)/welcome')} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={18} stroke={colors.deepPurple} />
        </Pressable>
        <BrandHeader compact />
        <View style={styles.loginIntro}>
          <AppText variant="title" style={styles.loginTitle}>{creating ? 'Create your account' : 'Welcome back!'}</AppText>
          <AppText color={colors.secondary} style={styles.loginSubtitle}>{creating ? 'Set up your sign-in to manage your business.' : 'Sign in to continue managing your business.'}</AppText>
        </View>
        <View style={styles.form}>
          {creating ? <Field label="Your name" placeholder="e.g. Mama Moyo" autoCapitalize="words" value={fullName} onChangeText={setFullName} returnKeyType="next" /> : null}
          <Field label="Email address" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} returnKeyType="next" />
          <View>
            <Field label="Password" placeholder="Enter your password" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} onSubmitEditing={submit} returnKeyType="go" />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} hitSlop={10} onPress={() => setShowPassword((value) => !value)} style={styles.passwordEye}>
              {showPassword ? <EyeOff size={19} stroke={colors.secondary} /> : <Eye size={19} stroke={colors.secondary} />}
            </Pressable>
          </View>
          {!creating ? <Pressable onPress={forgotPassword} disabled={busy} style={styles.forgotButton}><AppText variant="small" color={colors.purple}>Forgot password?</AppText></Pressable> : null}
          {error ? <View style={styles.errorBox}><AppText variant="small" color={colors.danger}>{error}</AppText></View> : null}
          {notice ? <View style={styles.noticeBox}><AppText variant="small" color={colors.success}>{notice}</AppText></View> : null}
          <AuthButton label={creating ? 'Create Account' : 'Log In'} loading={busy} onPress={submit} />
          {!configured ? <AppText variant="small" color={colors.warning} style={styles.configMessage}>Sign-in needs your Supabase project connection. Your local data remains on this device until sync is configured.</AppText> : null}
        </View>
        <View style={styles.switchRow}>
          <AppText color={colors.secondary}>{creating ? 'Already have an account?' : 'Don’t have an account?'}</AppText>
          <Pressable onPress={() => { setCreating((value) => !value); setError(''); setNotice(''); }} hitSlop={8}>
            <AppText variant="label" color={colors.purple}>{creating ? 'Log in' : 'Create one'}</AppText>
          </Pressable>
        </View>
        <ZimbabweFooter />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  welcome: { flexGrow: 1, justifyContent: 'flex-start', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, gap: 14 },
  brandBlock: { alignItems: 'center', gap: 4 },
  brandPromise: { textAlign: 'center', fontSize: 10, lineHeight: 14, marginTop: 0 },
  logo: { width: 48, height: 48, marginBottom: 2 },
  smallLogo: { width: 42, height: 42 },
  brandName: { fontFamily: 'Poppins-SemiBold', fontSize: 23, color: colors.deepPurple },
  brandTagline: { fontFamily: 'Inter-Medium', letterSpacing: 0.2 },
  hero: { aspectRatio: 4 / 3, overflow: 'hidden', alignSelf: 'stretch', marginHorizontal: -24 },
  heroImage: { width: '100%', height: '100%' },
  welcomeActions: { gap: 10 },
  buttonTouchArea: { width: '100%' },
  authButton: { minHeight: 52, width: '100%', borderRadius: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  primaryAction: { backgroundColor: colors.purple, borderColor: colors.purple },
  secondaryAction: { backgroundColor: colors.surface, borderColor: colors.purple },
  actionLabel: { fontFamily: 'Inter-SemiBold' },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.65 },
  country: { alignItems: 'center', paddingTop: 2, marginTop: 'auto' },
  loginPage: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 18, gap: 16 },
  backButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.lavenderTint, alignItems: 'center', justifyContent: 'center' },
  loginIntro: { alignItems: 'center', gap: 3, marginTop: 2, marginBottom: 2 },
  loginTitle: { color: colors.deepPurple, textAlign: 'center', fontSize: 24 },
  loginSubtitle: { textAlign: 'center', lineHeight: 21, maxWidth: 290 },
  form: { gap: 13 },
  passwordEye: { position: 'absolute', right: 14, top: 32, height: 48, justifyContent: 'center' },
  forgotButton: { alignSelf: 'flex-end', marginTop: -5, paddingVertical: 3 },
  configMessage: { lineHeight: 18, textAlign: 'center' },
  errorBox: { borderRadius: 12, padding: 12, backgroundColor: '#FCEBED' },
  noticeBox: { borderRadius: 12, padding: 12, backgroundColor: '#E7F5EF' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 2 },
});
