import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { font, hairline, maxScale } from '../theme/tokens';

/** Scroll tracking for the collapsing large-title pattern. */
export function useCollapsibleTitle() {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  return { scrollY, onScroll };
}

interface CompactHeaderProps {
  title: string;
  scrollY: SharedValue<number>;
}

/**
 * Inline header bar that fades in as the in-content large title scrolls
 * away, mirroring the native iOS large-title collapse.
 */
export function CompactHeader({ title, scrollY }: CompactHeaderProps) {
  const { mode, colors } = useTheme();

  const containerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [28, 52], [0, 1], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [28, 52],
          [8, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View
      // Decorative duplicate of the in-content title; hidden from readers.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.bar,
        {
          backgroundColor: colors.bg,
          borderBottomColor: hairline(mode, 0.12),
        },
        containerStyle,
      ]}
    >
      <Animated.View style={titleStyle}>
        <Text
          maxFontSizeMultiplier={maxScale('headline')}
          numberOfLines={1}
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/** Wraps a scroll view so the compact header can overlay its top edge. */
export function CollapsibleTitleContainer({ children }: { children: React.ReactNode }) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    left: 0,
    minHeight: 44,
    paddingHorizontal: 60,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  container: {
    flex: 1,
  },
  title: {
    ...font('headline'),
  },
});
