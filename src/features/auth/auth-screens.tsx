import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, ImageBackground, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Heart, ShieldCheck, Tag, Truck } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { AppText, Field } from '@/components/ui/primitives';
import { useAuth } from './auth-context';
import { supabase } from '@/lib/supabase';

const logo = require('@/assets/images/brand/cart-mark.png');
const welcomeLogo = require('@/assets/images/brand/Mama’s Shop Speedy Cart Logo.png');
const welcomeStorefront = require('@/assets/images/marketing/Sunny Mama’s Shop Neighborhood Market.png');

function BrandHeader({ compact = false }: { compact?: boolean }) {
  if (!compact) return <View style={styles.brandBlock}>
    <Image source={welcomeLogo} resizeMode="contain" style={styles.welcomeLogo} accessibilityLabel="Mama’s Shop, Small Business · Big Dreams" />
  </View>;
  return <View style={styles.brandBlock}>
    <Image source={logo} style={[styles.logo, compact && styles.smallLogo]} accessibilityLabel="Mama’s Shop shopping cart logo" />
    <AppText variant="heading" style={[styles.brandName, compact && styles.compactBrandName]}>Mama’s Shop</AppText>
    <AppText variant="small" color={colors.deepPurple} style={styles.brandTagline}>Small Business · Big Dreams</AppText>
    {!compact ? <AppText variant="small" color={colors.secondary} style={styles.brandPromise}>Quality products · Fair prices · Serving our community</AppText> : null}
  </View>;
}

function AuthButton({ label, onPress, variant = 'primary', loading = false, icon }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary'; loading?: boolean; icon?: ReactNode }) {
  const primary = variant === 'primary';
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={loading} style={({ pressed }) => [styles.buttonTouchArea, pressed && !loading && styles.buttonPressed]}>
    <View style={[styles.authButton, primary ? styles.primaryAction : styles.secondaryAction, loading && styles.buttonDisabled]}>
      {loading ? <ActivityIndicator size="small" color={primary ? '#FFFFFF' : '#0646CE'} /> : <><AppText variant="label" color={primary ? '#FFFFFF' : '#0646CE'} style={styles.actionLabel}>{label}</AppText>{icon}</>}
    </View>
  </Pressable>;
}

function ZimbabweFooter() {
  return <View style={styles.country}><AppText style={styles.flag}>🇿🇼</AppText><View style={styles.footerDivider} /><AppText variant="label" color="#0646CE">Proudly Zimbabwean</AppText></View>;
}

function WelcomeBenefits() {
  const benefits = [
    { label: 'Safe &\nSecure', Icon: ShieldCheck, color: '#1764E8' },
    { label: 'Fast\nDelivery', Icon: Truck, color: '#F0A500' },
    { label: 'Great\nPrices', Icon: Tag, color: '#247A34' },
    { label: 'Local\nBusiness', Icon: Heart, color: '#F13E44' },
  ];
  return <View style={styles.benefits}>{benefits.map(({ label, Icon, color }) => <View key={label} style={styles.benefit}>
    <View style={[styles.benefitIcon, { backgroundColor: color }]}><Icon size={19} color="#FFFFFF" fill={label.startsWith('Local') ? '#FFFFFF' : 'none'} strokeWidth={2.5} /></View>
    <AppText variant="small" color="#0C3BA5" style={styles.benefitLabel}>{label}</AppText>
  </View>)}</View>;
}

export function WelcomeScreen() {
  return <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={styles.welcome}>
      <BrandHeader />
      <AppText variant="small" color="#536B91" style={styles.welcomePromise}>Quality products  •  Fair prices  •{ '\n' }Serving our community</AppText>
      <WelcomeBenefits />
      <ImageBackground source={welcomeStorefront} resizeMode="cover" style={styles.hero} imageStyle={styles.heroImage} accessibilityLabel="Sunny Mama’s Shop neighborhood market storefront" />
      <View style={styles.welcomeActions}>
        <AuthButton label="Get Started" icon={<ArrowRight size={21} color="#FFFFFF" />} onPress={() => router.push('/(auth)/login')} />
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
  welcome: { flexGrow: 1, justifyContent: 'flex-start', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 12, gap: 8 },
  brandBlock: { alignItems: 'center', gap: 4, alignSelf: 'stretch' },
  welcomeLogo: { width: '100%', aspectRatio: 2.34, maxHeight: 142 },
  welcomePromise: { textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: -7 },
  benefits: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', paddingHorizontal: 2, paddingTop: 2, paddingBottom: 3 },
  benefit: { flex: 1, alignItems: 'center', gap: 4 },
  benefitIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  benefitLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, textAlign: 'center' },
  brandPromise: { textAlign: 'center', fontSize: 10, lineHeight: 14, marginTop: 0 },
  logo: { width: 46, height: 46, marginBottom: 2 },
  smallLogo: { width: 40, height: 40 },
  brandName: { fontFamily: 'Poppins-SemiBold', fontSize: 32, lineHeight: 38, color: colors.deepPurple },
  compactBrandName: { fontSize: 26, lineHeight: 32 },
  brandTagline: { fontFamily: 'Inter-Medium', letterSpacing: 0.2, marginTop: 2 },
  hero: { width: '100%', aspectRatio: 1.5, overflow: 'hidden', alignSelf: 'stretch', backgroundColor: '#D9E9FF' },
  heroImage: { width: '100%', height: '100%' },
  welcomeActions: { gap: 9, marginTop: 2 },
  buttonTouchArea: { width: '100%' },
  authButton: { minHeight: 54, width: '100%', borderRadius: 28, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, borderWidth: 1.5 },
  primaryAction: { backgroundColor: '#0646CE', borderColor: '#0646CE' },
  secondaryAction: { backgroundColor: colors.surface, borderColor: '#1454F5' },
  actionLabel: { fontFamily: 'Inter-SemiBold', fontSize: 16, letterSpacing: 0.1 },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.65 },
  country: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 5, marginTop: 'auto', gap: 12 },
  flag: { fontSize: 23 },
  footerDivider: { width: 1.5, height: 22, borderRadius: 999, backgroundColor: '#1454F5' },
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
