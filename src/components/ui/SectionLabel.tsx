import { Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { label } from '../../theme/tokens';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <Text style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 8, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, color: label(mode, 0.45) }}>
      {children}
    </Text>
  );
}
