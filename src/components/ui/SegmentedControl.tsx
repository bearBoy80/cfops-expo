import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, font, foreground, label, maxScale, spacing } from '../../theme/tokens';
import { haptics } from '../../utils/haptics';

export interface Segment<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  segments: readonly Segment<T>[];
  selected: T;
  onChange: (id: T) => void;
  testIDPrefix?: string;
}

/** iOS-style segmented control matching the design reference. */
export function SegmentedControl<T extends string>({
  segments,
  selected,
  onChange,
  testIDPrefix = 'segment',
}: Props<T>) {
  const { mode, colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.searchBg }]}>
      {segments.map((segment) => {
        const active = segment.id === selected;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={segment.id}
            onPress={() => {
              if (!active) {
                haptics.selection();
              }
              onChange(segment.id);
            }}
            style={[
              styles.segment,
              active && { backgroundColor: accent.orange },
            ]}
            testID={`${testIDPrefix}-${segment.id}`}
          >
            <Text
              maxFontSizeMultiplier={maxScale('subhead')}
              numberOfLines={1}
              style={[
                styles.label,
                { color: active ? foreground.onAccent : label(mode, 0.6) },
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    flexDirection: 'row',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    padding: spacing.xs,
  },
  label: {
    ...font('subhead', '600'),
  },
  segment: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingVertical: 6,
  },
});
