import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { RefreshCw, Users } from 'lucide-react-native';
import { AppText, Card, Page, PrimaryButton, StatusBadge } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { formatDate } from '@/lib/format';
import { listBusinessTeam, type TeamMember } from '@/services/team-service';

export function TeamScreen() {
  const { session, businessId } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMembers(await listBusinessTeam());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The shop team could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the server roster when the screen opens.
  useEffect(() => { void load(); }, [load]);

  return (
    <Page
      title="Shop team"
      subtitle="People who can work in this shop."
      back
      right={(
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh team" disabled={loading} onPress={() => void load()} className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint active:opacity-75">
          <RefreshCw size={18} color={colors.deepPurple} />
        </Pressable>
      )}
    >
      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint">
            <Users size={21} color={colors.deepPurple} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <AppText variant="heading">Team members</AppText>
            <AppText variant="small" color={colors.secondary}>
              {members.length ? `${members.length} ${members.length === 1 ? 'person' : 'people'} in this shop` : 'Your shop access roster'}
            </AppText>
          </View>
        </View>
        {loading && !members.length ? (
          <AppText color={colors.secondary}>Loading your team…</AppText>
        ) : error ? (
          <View className="gap-3">
            <AppText color={colors.danger}>{error}</AppText>
            <PrimaryButton label="Try again" onPress={() => void load()} />
          </View>
        ) : members.length ? members.map((member) => {
          const isCurrentUser = member.user_id === session?.user.id;
          const initials = member.member_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
          return (
          <View key={member.user_id} className="min-h-[68px] flex-row items-center gap-3 border-t border-line pt-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-tint">
                <AppText variant="label" color={colors.deepPurple}>{initials || 'U'}</AppText>
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <AppText variant="label" numberOfLines={1}>{member.member_name}</AppText>
                  {isCurrentUser ? <StatusBadge label="You" tone="purple" /> : null}
                </View>
                <AppText variant="small" color={colors.secondary}>
                  {member.role === 'owner' ? 'Shop owner' : `Staff · joined ${formatDate(member.joined_at)}`}
                </AppText>
              </View>
              <StatusBadge label={member.role === 'owner' ? 'Owner' : 'Staff'} tone={member.role === 'owner' ? 'amber' : 'green'} />
            </View>
          );
        }) : (
          <View className="gap-3">
            <AppText color={colors.secondary}>No team members are linked to this shop yet.</AppText>
            {session?.user.id === businessId ? (
              <PrimaryButton label="Manage team access" onPress={() => router.push('/settings/business')} />
            ) : null}
          </View>
        )}
      </Card>
      <AppText variant="small" color={colors.secondary}>
        Sales and stock updates made by any listed member are shared with the shop.
      </AppText>
    </Page>
  );
}
