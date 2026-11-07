import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@/features/auth/auth-context';
import { useSyncStatus } from '@/features/sync/sync-context';
import { AppText, Card, Page, PrimaryButton, StatusBadge } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';
import { formatDate, formatMoney } from '@/lib/format';
import {
  listChangeOwed,
  settleChangeOwed,
  type ChangeOwedRecord,
} from '@/db/repositories/sales';

type ChangeOwedFilter = 'OPEN' | 'SETTLED' | 'ALL';

const filters: { key: ChangeOwedFilter; label: string }[] = [
  { key: 'OPEN', label: 'To return' },
  { key: 'SETTLED', label: 'Returned' },
  { key: 'ALL', label: 'All' },
];

export function ChangeOwedScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? '';
  const { revision } = useSyncStatus();
  const [records, setRecords] = useState<ChangeOwedRecord[]>([]);
  const [filter, setFilter] = useState<ChangeOwedFilter>('OPEN');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    void revision;
    let active = true;
    setLoading(true);
    setError('');
    void listChangeOwed(db, ownerId, { status: filter })
      .then((items) => {
        if (active) setRecords(items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Change owed records could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [db, ownerId, filter, revision]));

  const returnChange = async (record: ChangeOwedRecord) => {
    setBusyId(record.id);
    setError('');
    try {
      await settleChangeOwed(db, ownerId, record.id);
      setRecords(await listChangeOwed(db, ownerId, { status: filter }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Change could not be marked as returned.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Page title="Change owed" subtitle="Track change waiting to be returned to customers." back>
      <View className="flex-row gap-2">
        {filters.map(({ key, label }) => {
          const selected = filter === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFilter(key)}
              className={`min-h-10 flex-1 items-center justify-center rounded-full border px-3 ${selected ? 'border-brand bg-brand' : 'border-line bg-surface'}`}
            >
              <AppText variant="small" color={selected ? colors.surface : colors.secondary}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Card>
          <AppText variant="small" color={colors.danger}>{error}</AppText>
        </Card>
      ) : null}

      {records.map((record) => (
        <Card key={record.id} className="gap-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <AppText variant="label">{record.customer_name}</AppText>
              <AppText variant="small" color={colors.secondary}>
                {record.receipt_number ? `Receipt ${record.receipt_number} · ` : ''}
                {formatDate(record.created_at)}
              </AppText>
            </View>
            <AppText variant="amount" color={record.status === 'OPEN' ? colors.warning : colors.success} style={{ fontSize: 18 }}>
              {formatMoney(record.amount_cents)}
            </AppText>
          </View>
          {record.status === 'OPEN' ? (
            <PrimaryButton
              label={busyId === record.id ? 'Saving…' : 'Mark as returned'}
              loading={busyId === record.id}
              onPress={() => Alert.alert(
                'Return change to customer?',
                `Confirm that ${formatMoney(record.amount_cents)} was returned to ${record.customer_name}.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Mark returned', onPress: () => void returnChange(record) },
                ],
              )}
            />
          ) : (
            <StatusBadge label="Returned" tone="green" />
          )}
        </Card>
      ))}

      {!loading && records.length === 0 && !error ? (
        <Card>
          <AppText variant="label">
            {filter === 'OPEN' ? 'No change is waiting to be returned.' : 'No change records found.'}
          </AppText>
          <AppText variant="small" color={colors.secondary} style={{ marginTop: 4 }}>
            Change owed from cash sales will appear here.
          </AppText>
        </Card>
      ) : null}
      {loading && records.length === 0 ? (
        <Card>
          <AppText variant="small" color={colors.secondary}>Loading change owed…</AppText>
        </Card>
      ) : null}
    </Page>
  );
}
