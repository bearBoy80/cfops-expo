import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

/**
 * Card-style wrapper for one virtualized list row. Rounding only the first
 * and last rows makes independently rendered rows read as a single card.
 */
export function CardRow({
  first,
  last,
  children,
}: {
  first: boolean;
  last: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.surface },
        first && styles.first,
        last && styles.last,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  first: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  last: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  row: {
    marginHorizontal: spacing.lg,
    overflow: 'hidden',
  },
});
