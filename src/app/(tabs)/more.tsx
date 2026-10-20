import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Database, LogOut, Settings } from 'lucide-react-native';
import { Page, Card, AppText } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const links = [
  { title: 'Shop settings', subtitle: 'Shop name, currency, and stock reminders', icon: Settings, path: '/settings' },
  { title: 'Sync status', subtitle: 'Check offline saves and resolve sync issues', icon: Database, path: '/settings/sync' },
] as const;

export default function MoreScreen() {
  const signOut = async () => {
    const result = await supabase?.auth.signOut();
    if (result?.error) Alert.alert('Could not sign out', result.error.message);
    else router.replace('/(auth)/welcome');
  };

  return <Page title="More" subtitle="Shop settings and account access.">
    <Card style={{ gap: 3 }}>{links.map(({ title, subtitle, icon: Icon, path }) => <Pressable key={title} onPress={() => router.push(path)} style={styles.row}><View style={styles.icon}><Icon size={19} stroke={colors.purple} /></View><View style={{ flex: 1 }}><AppText variant="label">{title}</AppText><AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }}>{subtitle}</AppText></View><ChevronRight size={18} stroke={colors.secondary} /></Pressable>)}</Card>
    <Pressable onPress={signOut} style={styles.signout}><LogOut size={18} stroke={colors.danger} /><AppText variant="label" color={colors.danger}>Log out</AppText></Pressable>
  </Page>;
}

const styles = StyleSheet.create({
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, borderBottomWidth: 1, borderColor: colors.border },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.lavenderTint, alignItems: 'center', justifyContent: 'center' },
  signout: { minHeight: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, backgroundColor: '#FCEBED', borderRadius: 14 },
});
