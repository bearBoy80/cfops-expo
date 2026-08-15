import { Stack } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';

export default function ZonesLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
