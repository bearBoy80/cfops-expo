import { Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { label } from '../../theme/tokens';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <Text style={{ marginHorizontal: 16, marginTop: 24, marginBottom: 8, fontSize: 13, fontWeight: '400', textTransform: 'uppercase', letterSpacing: 0.5, color: label(mode, 0.5) }}>
      {children}
    </Text>
  );
}
