import { StyleSheet, Text, View } from 'react-native';

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
    backgroundColor: '#fff',
  },
  title: {
    color: '#17231d',
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    marginTop: 8,
    color: '#647067',
    fontSize: 15,
    textAlign: 'center',
  },
});
