import { Redirect } from 'expo-router';
import { LoadingScreen } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/auth-context';

export default function IndexRoute() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen label="Checking your account…" />;
  return <Redirect href={session ? '/(tabs)' : '/(auth)/welcome'} />;
}
