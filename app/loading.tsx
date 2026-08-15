import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { accent } from '@/src/theme/tokens';
import { useTheme } from '@/src/theme/ThemeContext';

export default function Loading() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ActivityIndicator color={accent.orange} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
