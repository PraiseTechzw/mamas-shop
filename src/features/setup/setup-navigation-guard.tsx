import { useEffect, useState, type PropsWithChildren } from 'react';
import { Redirect, useSegments } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { LoadingScreen } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/auth-context';
import { needsShopSetup } from '@/db/repositories/settings';

export function SetupNavigationGuard({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const { session, businessId, loading } = useAuth();
  const segments = useSegments();
  const [checked, setChecked] = useState<{ userId: string; required: boolean } | null>(null);
  const onSetupRoute = segments[0] === 'setup';
  const userId = session?.user.id;

  useEffect(() => {
    if (loading || !userId || !businessId || businessId !== userId) return;
    let active = true;
    void needsShopSetup(db, userId).then((required) => {
      if (active) setChecked({ userId, required });
    }).catch(() => {
      // Fail closed: the user must complete setup if local setup state cannot be read.
      if (active) setChecked({ userId, required: true });
    });
    return () => { active = false; };
  }, [db, loading, userId, businessId]);

  if (loading) return <LoadingScreen label="Checking your account…" />;
  if (!session) return children;
  if (!businessId) return <LoadingScreen label="Checking your shop setup…" />;
  if (businessId !== session.user.id) return onSetupRoute ? <Redirect href="/(tabs)" /> : children;
  if (checked?.userId !== session.user.id) return <LoadingScreen label="Checking your shop setup…" />;
  if (checked.required && !onSetupRoute) return <Redirect href="/setup" />;
  if (!checked.required && onSetupRoute) return <Redirect href="/(tabs)" />;
  return children;
}
