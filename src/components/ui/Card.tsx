import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

export function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface }}>{children}</View>;
}
