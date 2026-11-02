import { useEffect, useState, type PropsWithChildren } from 'react';
import { Redirect, useSegments } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { LoadingScreen } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/auth-context';
import { needsShopSetup } from '@/db/repositories/settings';

export function SetupNavigationGuard({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const { session, userId, businessId, offlineAccess, loading } = useAuth();
  const segments = useSegments();
  const [checked, setChecked] = useState<{ userId: string; required: boolean } | null>(null);
  const onSetupRoute = segments[0] === 'setup';
  const accountId = session?.user.id ?? userId;

  useEffect(() => {
    if (loading || offlineAccess || !session || !accountId || !businessId || businessId !== accountId) return;
    let active = true;
    void needsShopSetup(db, accountId).then((required) => {
      if (active) setChecked({ userId: accountId, required });
    }).catch(() => {
      // Fail closed: the user must complete setup if local setup state cannot be read.
      if (active) setChecked({ userId: accountId, required: true });
    });
    return () => { active = false; };
  }, [db, loading, accountId, businessId, offlineAccess, session]);

  if (loading) return <LoadingScreen label="Checking your account…" />;
  if (!session && !offlineAccess) return children;
  if (offlineAccess) return onSetupRoute ? <Redirect href="/(tabs)" /> : children;
  if (!businessId || !session) return <LoadingScreen label="Checking your shop setup…" />;
  if (businessId !== session.user.id) return onSetupRoute ? <Redirect href="/(tabs)" /> : children;
  if (checked?.userId !== session.user.id) return <LoadingScreen label="Checking your shop setup…" />;
  if (checked.required && !onSetupRoute) return <Redirect href="/setup" />;
  if (!checked.required && onSetupRoute) return <Redirect href="/(tabs)" />;
  return children;
}
