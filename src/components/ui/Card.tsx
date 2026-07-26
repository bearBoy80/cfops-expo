import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface }}>{children}</View>;
}
