import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, radius, spacing } from '@/constants/theme';

export function AppText({ children, variant = 'body', color, style, numberOfLines }: PropsWithChildren<{ variant?: 'body' | 'small' | 'label' | 'title' | 'heading' | 'amount'; color?: string; style?: object; numberOfLines?: number }>) {
  const fontFamily = variant === 'title' || variant === 'heading' ? 'Poppins-SemiBold' : variant === 'amount' ? 'Inter-SemiBold' : variant === 'label' ? 'Inter-Medium' : 'Inter-Regular';
  const fontSize = variant === 'title' ? 27 : variant === 'heading' ? 18 : variant === 'small' ? 12 : variant === 'label' ? 13 : variant === 'amount' ? 22 : 15;
  return <Text numberOfLines={numberOfLines} style={[{ color: color ?? colors.text, fontFamily, fontSize, lineHeight: variant === 'title' ? 34 : undefined }, style]}>{children}</Text>;
}

export function Page({ children, title, subtitle, back = false, right, scroll = true, contentStyle }: PropsWithChildren<{ title?: string; subtitle?: string; back?: boolean; right?: ReactNode; scroll?: boolean; contentStyle?: ViewStyle }>) {
  const content = <View style={[styles.content, contentStyle]}>{title ? <View style={styles.headingRow}>{back ? <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}><ChevronLeft stroke={colors.deepPurple} size={22} /></Pressable> : null}<View style={styles.headingText}><AppText variant="title">{title}</AppText>{subtitle ? <AppText color={colors.secondary} style={{ marginTop: 3 }}>{subtitle}</AppText> : null}</View>{right}</View> : null}{children}</View>;
  return <SafeAreaView className="flex-1 bg-canvas" edges={['top']}><View className="flex-1 bg-canvas">{scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 30 }}>{content}</ScrollView> : content}</View></SafeAreaView>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({ label, onPress, disabled, loading, icon, style }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: ReactNode; style?: ViewStyle }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.primaryButton, style, (disabled || loading) && styles.disabled, pressed && !disabled && { opacity: 0.88 }]}><>{loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : icon}{!loading ? <AppText variant="label" color="#FFFFFF">{label}</AppText> : null}</></Pressable>;
}

export function SecondaryButton({ label, onPress, style, icon }: { label: string; onPress: () => void; style?: ViewStyle; icon?: ReactNode }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryButton, style, pressed && { backgroundColor: colors.lavenderTint }]}>{icon}<AppText variant="label" color={colors.deepPurple}>{label}</AppText></Pressable>;
}

export function Field({ label, error, containerStyle, inputStyle, ...props }: TextInputProps & { label: string; error?: string; containerStyle?: ViewStyle; inputStyle?: TextStyle }) {
  return <View style={[styles.field, containerStyle]}>{label ? <AppText variant="label" style={{ marginBottom: 7 }}>{label}</AppText> : null}<TextInput placeholderTextColor="#9A9AAC" {...props} style={[styles.input, inputStyle, props.multiline && { minHeight: 90, textAlignVertical: 'top' }]} />{error ? <AppText variant="small" color={colors.danger} style={{ marginTop: 5 }}>{error}</AppText> : null}</View>;
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionRow}><AppText variant="heading">{children}</AppText>{action && onAction ? <Pressable onPress={onAction} hitSlop={8}><AppText variant="label" color={colors.purple}>{action}</AppText></Pressable> : null}</View>;
}

export function LoadingScreen({ label = 'Getting things ready…' }: { label?: string }) {
  return <SafeAreaView className="flex-1 bg-canvas" style={{ alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.purple} /><AppText color={colors.secondary} style={{ marginTop: 14 }}>{label}</AppText></SafeAreaView>;
}

export function StatusBadge({ label, tone = 'purple' }: { label: string; tone?: 'purple' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones = { purple: [colors.lavenderTint, colors.deepPurple], green: ['#E7F5EF', colors.success], amber: ['#FFF5DC', colors.warning], red: ['#FCEBED', colors.danger], blue: ['#EAF2FF', colors.info] } as const;
  const selected = tones[tone];
  return <View style={{ backgroundColor: selected[0], paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.chip, alignSelf: 'flex-start' }}><AppText variant="small" color={selected[1]}>{label}</AppText></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 24, gap: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  headingText: { flex: 1 },
  back: { height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.lavenderTint },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.card, borderWidth: 1, borderColor: colors.border },
  primaryButton: { minHeight: 52, borderRadius: radius.button, backgroundColor: colors.purple, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondaryButton: { minHeight: 48, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { opacity: 0.55 },
  field: { gap: 0 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: 'Inter-Regular', fontSize: 15 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
