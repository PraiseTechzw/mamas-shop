import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { AppText, Card } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';

export function IllustratedEmptyState({
  image,
  title,
  description,
  action,
}: {
  image: ImageSourcePropType;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <Card style={styles.card}>
    <Image source={image} resizeMode="contain" style={styles.image} accessibilityLabel={title} />
    <AppText variant="heading" style={styles.title}>{title}</AppText>
    <AppText color={colors.secondary} style={styles.description}>{description}</AppText>
    {action ? <View style={styles.action}>{action}</View> : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 9, padding: 18 },
  image: { width: 148, height: 132 },
  title: { textAlign: 'center' },
  description: { textAlign: 'center', lineHeight: 21 },
  action: { alignSelf: 'stretch', marginTop: 2 },
});
