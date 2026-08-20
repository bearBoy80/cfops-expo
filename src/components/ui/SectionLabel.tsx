import { Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { font, label, maxScale, spacing } from '../../theme/tokens';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={maxScale('subhead')}
      style={{
        ...font('subhead'),
        marginHorizontal: spacing.lg,
        marginTop: spacing.xxl,
        marginBottom: spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: label(mode, 0.5),
      }}
    >
      {children}
    </Text>
  );
}
