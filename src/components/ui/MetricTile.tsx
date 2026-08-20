import { memo } from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { font, label, maxScale, radius, spacing, tint } from '../../theme/tokens';

interface Props {
  label: string;
  value: string;
  sub?: string;
  color: string;
  Icon?: LucideIcon;
}

export const MetricTile = memo(function MetricTile({ label: title, value, sub, color, Icon }: Props) {
  const { mode, colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={[title, value, sub].filter(Boolean).join(', ')}
      style={{ flex: 1, borderRadius: radius.lg, padding: 14, backgroundColor: colors.surface }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.sm }}>
        {Icon ? (
          <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(color, '22') }}>
            <Icon size={14} color={color} />
          </View>
        ) : null}
        <Text
          maxFontSizeMultiplier={maxScale('footnote')}
          numberOfLines={1}
          style={{ ...font('footnote', '500'), flexShrink: 1, color: label(mode, 0.5) }}
        >
          {title}
        </Text>
      </View>
      <Text
        maxFontSizeMultiplier={maxScale('title')}
        style={{ ...font('title'), fontVariant: ['tabular-nums'], color: colors.text }}
      >
        {value}
      </Text>
      {sub ? (
        <Text
          maxFontSizeMultiplier={maxScale('caption')}
          numberOfLines={1}
          style={{ ...font('caption'), marginTop: 3, color: label(mode, 0.4) }}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
});
