import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

type RoutePlaceholderProps = {
  title: string;
};

export function RoutePlaceholder({ title }: RoutePlaceholderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>This screen is ready for its feature implementation.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.deepPurple,
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    marginTop: 8,
    color: colors.secondary,
    fontSize: 15,
    textAlign: 'center',
  },
});
