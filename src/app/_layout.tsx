import '@/global.css';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import { Suspense } from 'react';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { AuthProvider } from '@/features/auth/auth-context';
import { migrateDbIfNeeded } from '@/db/migrations';
import { databaseName } from '@/db/client';
import { colors } from '@/constants/theme';

export default function RootLayout() {
  const [loaded] = useFonts({
    'Poppins-Regular': require('../../assets/fonts/Poppins/Poppins-Regular.ttf'),
    'Poppins-SemiBold': require('../../assets/fonts/Poppins/Poppins-SemiBold.ttf'),
    'Poppins-Bold': require('../../assets/fonts/Poppins/Poppins-Bold.ttf'),
    'Inter-Regular': require('../../assets/fonts/Inter/static/Inter_28pt-Regular.ttf'),
    'Inter-Medium': require('../../assets/fonts/Inter/static/Inter_28pt-Medium.ttf'),
    'Inter-SemiBold': require('../../assets/fonts/Inter/static/Inter_28pt-SemiBold.ttf'),
    'Inter-Bold': require('../../assets/fonts/Inter/static/Inter_28pt-Bold.ttf'),
  });
  if (!loaded) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.purple} /></View>;
  return <Suspense fallback={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.purple} /></View>}><SQLiteProvider databaseName={databaseName} onInit={migrateDbIfNeeded} useSuspense><AuthProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></AuthProvider></SQLiteProvider></Suspense>;
}
