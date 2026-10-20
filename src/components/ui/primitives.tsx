import { useState, type PropsWithChildren, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, radius } from '@/constants/theme';

export function AppText({ children, variant = 'body', color, style, numberOfLines }: PropsWithChildren<{ variant?: 'body' | 'small' | 'label' | 'title' | 'heading' | 'amount'; color?: string; style?: object; numberOfLines?: number }>) {
  const fontFamily = variant === 'title' || variant === 'heading' ? 'Poppins-SemiBold' : variant === 'amount' ? 'Inter-SemiBold' : variant === 'label' ? 'Inter-Medium' : 'Inter-Regular';
  const fontSize = variant === 'title' ? 27 : variant === 'heading' ? 18 : variant === 'small' ? 12 : variant === 'label' ? 13 : variant === 'amount' ? 22 : 15;
  return <Text numberOfLines={numberOfLines} style={[{ color: color ?? colors.text, fontFamily, fontSize, lineHeight: variant === 'title' ? 34 : undefined }, style]}>{children}</Text>;
}

export function Page({ children, title, subtitle, back = false, right, scroll = true, contentStyle, footer }: PropsWithChildren<{ title?: string; subtitle?: string; back?: boolean; right?: ReactNode; scroll?: boolean; contentStyle?: ViewStyle; footer?: ReactNode }>) {
  const content = <View className="gap-4 px-5 pb-6 pt-3" style={contentStyle}>{title ? <View className="mb-1 flex-row items-center gap-2.5">{back ? <Pressable onPress={() => router.back()} hitSlop={12} className="h-10 w-10 items-center justify-center rounded-[13px] bg-brand-tint"><ChevronLeft stroke={colors.deepPurple} size={22} /></Pressable> : null}<View className="min-w-0 flex-1"><AppText variant="title">{title}</AppText>{subtitle ? <AppText color={colors.secondary} style={{ marginTop: 3 }}>{subtitle}</AppText> : null}</View>{right}</View> : null}{children}</View>;
  return <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}><View className="flex-1 bg-canvas">{scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>{content}</ScrollView> : content}{footer ? <View className="border-t border-line bg-surface px-4 pt-2" style={{ paddingBottom: 8 }}>{footer}</View> : null}</View></SafeAreaView>;
}

export function Card({ children, style, className }: PropsWithChildren<{ style?: ViewStyle; className?: string }>) {
  return <View className={`relative rounded-[18px] border border-line bg-surface p-4 ${className ?? ''}`} style={style}>
    <View pointerEvents="none" className="absolute right-3 top-3 flex-row gap-1">
      <View className="h-1.5 w-1.5 rounded-full bg-gold/70" />
      <View className="h-1.5 w-1.5 rounded-full bg-brand/35" />
      <View className="h-1.5 w-1.5 rounded-full bg-brand-tint" />
    </View>
    {children}
  </View>;
}

export function PrimaryButton({ label, onPress, disabled, loading, icon, style, onLayout }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: ReactNode; style?: ViewStyle; onLayout?: (event: LayoutChangeEvent) => void }) {
  return <Pressable onLayout={onLayout} accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }} onPress={onPress} disabled={disabled || loading} className={`h-[54px] min-h-[54px] flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-brand bg-brand px-[18px] active:opacity-90 ${(disabled || loading) ? 'opacity-80' : ''}`} style={style}>{loading ? <ActivityIndicator color={colors.surface} size="small" /> : icon}<AppText variant="label" color={colors.surface}>{label}</AppText></Pressable>;
}

export function SecondaryButton({ label, onPress, style, icon }: { label: string; onPress: () => void; style?: ViewStyle; icon?: ReactNode }) {
  return <Pressable accessibilityRole="button" onPress={onPress} className="h-[54px] min-h-[54px] flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-brand bg-surface px-4 active:bg-brand-tint" style={style}>{icon}<AppText variant="label" color={colors.deepPurple}>{label}</AppText></Pressable>;
}

export function Field({ label, error, containerStyle, inputStyle, icon, focusAccent = false, inputRef, onFocus, onBlur, ...props }: TextInputProps & { label: string; error?: string; containerStyle?: ViewStyle; inputStyle?: TextStyle; icon?: ReactNode; focusAccent?: boolean; inputRef?: Ref<TextInput> }) {
  const [focusProgress] = useState(() => new Animated.Value(0));
  const focusStyle = focusAccent ? {
    borderColor: focusProgress.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.gold] }),
    backgroundColor: focusProgress.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, colors.lavenderTint] }),
    shadowColor: colors.gold,
    shadowOpacity: focusProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }),
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  } : null;
  return <View style={[styles.field, containerStyle]}>
    {label ? <AppText variant="label" style={{ marginBottom: 7 }}>{label}</AppText> : null}
    <Animated.View style={[styles.inputFrame, focusStyle]}>
      {icon ? <View pointerEvents="none" style={styles.inputIcon}>{icon}</View> : null}
      <TextInput
        ref={inputRef}
        placeholderTextColor={colors.secondary}
        underlineColorAndroid="transparent"
        {...props}
        onFocus={(event) => {
          if (focusAccent) Animated.timing(focusProgress, { toValue: 1, duration: 140, useNativeDriver: false }).start();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          if (focusAccent) Animated.timing(focusProgress, { toValue: 0, duration: 140, useNativeDriver: false }).start();
          onBlur?.(event);
        }}
        style={[styles.input, icon ? styles.inputWithIcon : null, inputStyle, props.multiline && { minHeight: 90, textAlignVertical: 'top' }]}
      />
    </Animated.View>
    {error ? <AppText variant="small" color={colors.danger} style={{ marginTop: 5 }}>{error}</AppText> : null}
  </View>;
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionRow}><AppText variant="heading">{children}</AppText>{action && onAction ? <Pressable onPress={onAction} hitSlop={8}><AppText variant="label" color={colors.purple}>{action}</AppText></Pressable> : null}</View>;
}

export function LoadingScreen({ label = 'Getting things ready…' }: { label?: string }) {
  return <SafeAreaView className="flex-1 bg-canvas" style={{ alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.purple} /><AppText color={colors.secondary} style={{ marginTop: 14 }}>{label}</AppText></SafeAreaView>;
}

export function StatusBadge({ label, tone = 'purple' }: { label: string; tone?: 'purple' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones = { purple: [colors.lavenderTint, colors.deepPurple], green: [colors.successTint, colors.success], amber: [colors.warningTint, colors.warning], red: [colors.dangerTint, colors.danger], blue: [colors.infoTint, colors.info] } as const;
  const selected = tones[tone];
  return <View style={{ backgroundColor: selected[0], paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.chip, alignSelf: 'flex-start' }}><AppText variant="small" color={selected[1]}>{label}</AppText></View>;
}

const styles = StyleSheet.create({
  field: { gap: 0 },
  inputFrame: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  inputIcon: { width: 42, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 52, borderRadius: 16, backgroundColor: 'transparent', paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: 'Inter-Regular', fontSize: 15 },
  inputWithIcon: { paddingLeft: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
