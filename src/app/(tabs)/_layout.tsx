import { Redirect, Tabs } from 'expo-router';
import { Ellipsis, House, Package, ReceiptText, Users } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { LoadingScreen } from '@/components/ui/primitives';

export default function TabsLayout() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.purple, tabBarInactiveTintColor: colors.secondary, tabBarStyle: { height: 68, paddingTop: 8, paddingBottom: 8, backgroundColor: '#FFFFFF', borderTopColor: colors.border }, tabBarLabelStyle: { fontFamily: 'Inter-Medium', fontSize: 10 } }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
    <Tabs.Screen name="sales" options={{ title: 'Sales', tabBarIcon: ({ color, size }) => <ReceiptText color={color} size={size} /> }} />
    <Tabs.Screen name="inventory" options={{ title: 'Stock', tabBarIcon: ({ color, size }) => <Package color={color} size={size} /> }} />
    <Tabs.Screen name="credit" options={{ title: 'Credit', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
    <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} /> }} />
  </Tabs>;
}
