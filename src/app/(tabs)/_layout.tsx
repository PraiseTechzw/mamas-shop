import { Redirect, Tabs } from 'expo-router';
import { Ellipsis, House, Package, ReceiptText, Users } from 'lucide-react-native';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { LoadingScreen } from '@/components/ui/primitives';

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const insets = useSafeAreaInsets();
  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  const tabBarIcon = (Icon: typeof House) => function RenderTabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <View style={[styles.iconSlot, focused && styles.activeIconSlot]}><Icon color={color} size={19} strokeWidth={2.2} /></View>;
  };
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.purple,
    tabBarInactiveTintColor: '#8290A8',
    tabBarHideOnKeyboard: true,
    tabBarItemStyle: styles.tabItem,
    tabBarStyle: { height: 62 + insets.bottom, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 5), backgroundColor: '#FFFFFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E8ECF4', elevation: 12, shadowColor: '#172554', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
    tabBarLabelStyle: styles.tabLabel,
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabBarIcon(House) }} />
    <Tabs.Screen name="sales" options={{ title: 'Sales', tabBarIcon: tabBarIcon(ReceiptText) }} />
    <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarIcon: tabBarIcon(Package) }} />
    <Tabs.Screen name="credit" options={{ title: 'Credit', tabBarIcon: tabBarIcon(Users) }} />
    <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabBarIcon(Ellipsis) }} />
  </Tabs>;
}

const styles = StyleSheet.create({
  tabItem: { paddingTop: 2 },
  tabLabel: { fontFamily: 'Inter-Medium', fontSize: 10, marginTop: 1 },
  iconSlot: { width: 38, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  activeIconSlot: { backgroundColor: '#EEEAFE' },
});
