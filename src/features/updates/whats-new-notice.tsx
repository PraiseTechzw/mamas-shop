import { useEffect, useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import 'expo-sqlite/localStorage/install';
import * as Updates from 'expo-updates';
import { Check, Sparkles } from 'lucide-react-native';
import { AppText, PrimaryButton } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';
import { releaseNotes } from './release-notes';

const lastSeenUpdateKey = 'mamas-shop:last-seen-update-id';

export function WhatsNewNotice() {
  const [visible, setVisible] = useState(false);
  const [storageError, setStorageError] = useState('');
  const updateId = Updates.isEnabled ? Updates.updateId : null;

  useEffect(() => {
    if (Platform.OS === 'web' || !updateId) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        setVisible(localStorage.getItem(lastSeenUpdateKey) !== updateId);
      } catch (error) {
        console.error('[updates] Could not read the last-seen update ID', error);
        setStorageError('We could not load or save this update notice. Please try again.');
        setVisible(true);
      }
    });
    return () => {
      active = false;
    };
  }, [updateId]);

  const dismiss = () => {
    if (!updateId) return;
    setStorageError('');
    try {
      localStorage.setItem(lastSeenUpdateKey, updateId);
      setVisible(false);
    } catch (error) {
      console.error('[updates] Could not save the last-seen update ID', error);
      setStorageError('We could not load or save this update notice. Please try again.');
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View className="flex-1 justify-center bg-text/50 px-5">
        <View className="gap-4 rounded-3xl border border-line bg-surface p-5">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint">
            <Sparkles size={22} color={colors.deepPurple} />
          </View>
          <View className="gap-1">
            <AppText variant="title" style={{ fontSize: 23, lineHeight: 29 }}>
              What’s new
            </AppText>
            <AppText variant="heading" color={colors.deepPurple}>
              {releaseNotes.title}
            </AppText>
          </View>
          <View className="gap-3">
            {releaseNotes.items.map((item) => (
              <View key={item} className="flex-row items-start gap-2.5">
                <Check size={17} color={colors.success} />
                <AppText color={colors.secondary} style={{ flex: 1, lineHeight: 21 }}>
                  {item}
                </AppText>
              </View>
            ))}
          </View>
          {storageError ? (
            <AppText variant="small" color={colors.danger}>{storageError}</AppText>
          ) : null}
          <PrimaryButton label="Got it" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
}
