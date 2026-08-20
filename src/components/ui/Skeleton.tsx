import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { label, radius, spacing } from '../../theme/tokens';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  round?: number;
  style?: ViewStyle;
}

/** Breathing placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height = 14, round = 7, style }: SkeletonProps) {
  const { mode } = useTheme();
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: round, backgroundColor: label(mode, 0.08) },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Two metric-tile shaped placeholders in a row. */
export function SkeletonTileRow() {
  const { colors } = useTheme();
  return (
    <View style={styles.tileRow}>
      {[0, 1].map((i) => (
        <View key={i} style={[styles.tile, { backgroundColor: colors.surface }]}>
          <Skeleton height={12} width="55%" />
          <Skeleton height={22} round={8} width="40%" style={styles.tileValue} />
        </View>
      ))}
    </View>
  );
}

/** Card-shaped placeholder with list-row shaped lines. */
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  const { mode, colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={[
            styles.row,
            i < rows - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: label(mode, 0.08),
            },
          ]}
        >
          <View style={styles.rowCopy}>
            <Skeleton height={13} width={i % 2 === 0 ? '62%' : '48%'} />
            <Skeleton height={10} width={i % 2 === 0 ? '38%' : '30%'} />
          </View>
          <Skeleton height={20} round={7} width={52} />
        </View>
      ))}
    </View>
  );
}

/**
 * Default first-load skeleton for list/detail screens:
 * a metric tile row followed by two list cards.
 */
export function ScreenSkeleton({ testID }: { testID?: string }) {
  return (
    <View testID={testID}>
      <SkeletonTileRow />
      <View style={styles.section}>
        <Skeleton height={11} width={120} style={styles.sectionLabel} />
        <SkeletonCard rows={3} />
      </View>
      <View style={styles.section}>
        <Skeleton height={11} width={90} style={styles.sectionLabel} />
        <SkeletonCard rows={4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowCopy: {
    flex: 1,
    gap: 7,
  },
  section: {
    marginTop: spacing.xxl,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  tile: {
    borderRadius: radius.lg,
    flex: 1,
    padding: 14,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  tileValue: {
    marginTop: spacing.md,
  },
});
