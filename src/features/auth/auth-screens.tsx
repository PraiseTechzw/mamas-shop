import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Dimensions, Image, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Heart, LockKeyhole, Mail, ShieldCheck, Tag, Truck, UserRound } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { AppText, Field } from '@/components/ui/primitives';
import { useAuth } from './auth-context';
import { supabase } from '@/lib/supabase';

const welcomeLogo = require('@/assets/images/brand/Mama’s Shop Speedy Cart Logo.png');
const welcomeStorefront = require('@/assets/images/marketing/Sunny Mama’s Shop Neighborhood Market.png');

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return <View style={[styles.brandBlock, compact && styles.compactBrandBlock]}>
    <Image source={welcomeLogo} resizeMode="contain" style={compact ? styles.compactWelcomeLogo : styles.welcomeLogo} accessibilityLabel="Mama’s Shop, Small Business · Big Dreams" />
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

function WelcomeWave() {
  return <Svg width="100%" height={52} viewBox="0 0 400 42" preserveAspectRatio="none" accessibilityLabel="Blue and yellow brand wave">
    <Path d="M0 4 C55 31 112 39 198 38 C282 37 345 23 400 0 L400 42 L0 42 Z" fill="#FFC83D" />
    <Path d="M0 13 C60 38 118 42 200 41 C285 40 348 28 400 8 L400 42 L0 42 Z" fill="#0646CE" />
  </Svg>;
}

function StorefrontHero() {
  return <View style={styles.hero} accessibilityLabel="Sunny Mama’s Shop neighborhood market storefront">
    <ImageBackground source={welcomeStorefront} resizeMode="cover" style={styles.heroImage} imageStyle={styles.heroImageContent}>
      <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="storefrontFadeTop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FCFDFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#FCFDFF" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="storefrontFadeBottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FCFDFF" stopOpacity="0" />
            <Stop offset="1" stopColor="#FCFDFF" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="400" height="68" fill="url(#storefrontFadeTop)" />
        <Rect x="0" y="232" width="400" height="68" fill="url(#storefrontFadeBottom)" />
      </Svg>
    </ImageBackground>
  </View>;
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
  return <SafeAreaView className="flex-1" style={styles.welcomeCanvas} edges={['top', 'bottom']}>
    <ScrollView className="flex-1" style={styles.welcomeCanvas} contentContainerStyle={styles.welcome}>
      <BrandHeader />
      <AppText variant="small" color="#536B91" style={styles.welcomePromise}>Quality products  •  Fair prices  •{ '\n' }Serving our community</AppText>
      <WelcomeBenefits />
      <StorefrontHero />
      <View style={styles.welcomeActions}>
        <AuthButton label="Get Started" icon={<ArrowRight size={21} color="#FFFFFF" />} onPress={() => router.push('/(auth)/login')} />
        <AuthButton label="Log In" variant="secondary" onPress={() => router.push('/(auth)/login')} />
      </View>
      <ZimbabweFooter />
    </ScrollView>
    <View pointerEvents="none" style={styles.waveDock}><WelcomeWave /></View>
  </SafeAreaView>;
}

export function LoginScreen() {
  const { configured } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
  const returnPath = (Array.isArray(next) ? next[0] : next) === '/(auth)/join-business' ? '/(auth)/join-business' : '/(tabs)';
  const [creating, setCreating] = useState(false);
  // Keep keystrokes in refs so typing does not rerender the whole auth screen
  // while Android's native keyboard is editing the focused TextInput.
  const fullName = useRef('');
  const email = useRef('');
  const password = useRef('');
  const fullNameInput = useRef<TextInput>(null);
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const loginScroll = useRef<ScrollView>(null);
  const focusedInput = useRef<TextInput | null>(null);
  const keyboardHeight = useRef(0);
  const scrollOffset = useRef(0);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const keepFocusedInputVisible = useCallback(() => {
    const input = focusedInput.current;
    const keyboard = keyboardHeight.current;
    if (!input || keyboard <= 0) return;

    input.measureInWindow((_x, y, _width, height) => {
      const visibleBottom = Dimensions.get('window').height - keyboard - 20;
      const overflow = y + height - visibleBottom;
      if (overflow > 0) {
        loginScroll.current?.scrollTo({ y: Math.max(0, scrollOffset.current + overflow), animated: true });
      }
    });
  }, []);

  const focusField = useCallback((input: TextInput | null) => {
    focusedInput.current = input;
    setTimeout(keepFocusedInputVisible, 120);
    setTimeout(keepFocusedInputVisible, 320);
  }, [keepFocusedInputVisible]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardHeight.current = event.endCoordinates.height;
      setTimeout(keepFocusedInputVisible, 80);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeight.current = 0;
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keepFocusedInputVisible]);

  const submit = async () => {
    setError('');
    setNotice('');
    if (!email.current.trim() || !password.current) { setError('Enter your email and password to continue.'); return; }
    if (password.current.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (creating && !fullName.current.trim()) { setError('Enter your name to create an account.'); return; }
    if (!supabase) { setError('The app is not connected yet. Add the Supabase URL and publishable key to your local .env file.'); return; }

    setBusy(true);
    try {
      if (creating) {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.current.trim(), password: password.current, options: { data: { full_name: fullName.current.trim() } } });
        if (authError) throw authError;
        if (data.session) router.replace(returnPath);
        else setNotice('Check your email to confirm your account, then log in here.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.current.trim(), password: password.current });
        if (authError) throw authError;
        router.replace(returnPath);
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
    if (!email.current.trim()) { setError('Enter your email address first.'); return; }
    if (!supabase) { setError('Add the Supabase connection details to your local .env file first.'); return; }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.current.trim(), { redirectTo: 'mamasshop://reset-password' });
      if (authError) setError(authError.message);
      else setNotice('If an account exists for this email, a reset link is on its way.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'We could not send a password reset link. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={loginScroll} className="flex-1 bg-canvas" keyboardDismissMode="none" keyboardShouldPersistTaps="always" scrollEventThrottle={16} onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} contentContainerStyle={styles.loginPage}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to welcome screen" onPress={() => router.replace('/(auth)/welcome')} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={18} stroke={colors.deepPurple} />
        </Pressable>
        <BrandHeader compact />
        <View style={styles.loginIntro}>
          <AppText variant="title" style={styles.loginTitle}>{creating ? 'Create your account' : 'Welcome back!'}</AppText>
          <AppText color={colors.secondary} style={styles.loginSubtitle}>{creating ? 'Set up your sign-in to manage your business.' : 'Sign in to continue managing your business.'}</AppText>
        </View>
        <View style={styles.form}>
          {creating ? <Field key="full-name" label="Your name" placeholder="e.g. Mama Moyo" icon={<UserRound size={18} color={colors.secondary} />} focusAccent inputRef={fullNameInput} onFocus={() => focusField(fullNameInput.current)} autoCapitalize="words" defaultValue="" onChangeText={(value) => { fullName.current = value; }} onSubmitEditing={() => emailInput.current?.focus()} returnKeyType="next" submitBehavior="submit" /> : null}
          <Field key="email" label="Email address" placeholder="you@example.com" icon={<Mail size={18} color={colors.secondary} />} focusAccent inputRef={emailInput} onFocus={() => focusField(emailInput.current)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} defaultValue="" onChangeText={(value) => { email.current = value; }} onSubmitEditing={() => passwordInput.current?.focus()} returnKeyType="next" submitBehavior="submit" />
          <View>
            <Field key="password" label="Password" placeholder="Enter your password" icon={<LockKeyhole size={18} color={colors.secondary} />} focusAccent inputRef={passwordInput} onFocus={() => focusField(passwordInput.current)} inputStyle={styles.passwordInput} secureTextEntry={!showPassword} defaultValue="" onChangeText={(value) => { password.current = value; }} onSubmitEditing={submit} returnKeyType="go" />
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
        <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/join-business')} style={{ alignSelf: 'center', paddingVertical: 8 }}>
          <AppText variant="label" color={colors.purple}>Have an invitation code? Join a business</AppText>
        </Pressable>
        <ZimbabweFooter />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  welcomeCanvas: { backgroundColor: '#FCFDFF' },
  welcome: { flexGrow: 1, justifyContent: 'flex-start', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 62, gap: 8 },
  brandBlock: { alignItems: 'center', gap: 4, alignSelf: 'stretch' },
  welcomeLogo: { width: '80%', aspectRatio: 2.34, maxHeight: 122, alignSelf: 'center' },
  welcomePromise: { textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: -7 },
  benefits: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', paddingHorizontal: 2, paddingTop: 2, paddingBottom: 3 },
  benefit: { flex: 1, alignItems: 'center', gap: 4 },
  benefitIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  benefitLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, textAlign: 'center' },
  compactBrandBlock: { marginBottom: 8 },
  compactWelcomeLogo: { width: '72%', aspectRatio: 2.34, maxHeight: 90, alignSelf: 'center' },
  hero: { aspectRatio: 1.5, overflow: 'hidden', alignSelf: 'stretch', marginHorizontal: -22 },
  heroImage: { ...StyleSheet.absoluteFill },
  heroImageContent: { width: '100%', height: '100%' },
  waveDock: { position: 'absolute', right: 0, bottom: 0, left: 0, height: 52 },
  welcomeActions: { width: '92%', alignSelf: 'center', gap: 9, marginTop: 18 },
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
  passwordInput: { paddingRight: 48 },
  forgotButton: { alignSelf: 'flex-end', marginTop: -5, paddingVertical: 3 },
  configMessage: { lineHeight: 18, textAlign: 'center' },
  errorBox: { borderRadius: 12, padding: 12, backgroundColor: '#FCEBED' },
  noticeBox: { borderRadius: 12, padding: 12, backgroundColor: '#E7F5EF' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 2 },
});
