import { Stack } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';

/**
 * Keeps `index` beneath any nested route. Without an anchor a group entered
 * directly — a deep link, or state restored after an auth round-trip — holds
 * only the nested screen, so `canGoBack()` is false and going back drops out of
 * the tab entirely instead of returning to the group root.
 */
export const unstable_settings = { anchor: 'index' };

export default function SettingsLayout() {
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
