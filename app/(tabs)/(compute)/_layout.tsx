import { Stack } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';

/** See the note in (settings)/_layout.tsx for why every group needs an anchor. */
export const unstable_settings = { anchor: 'index' };

export default function ComputeLayout() {
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
