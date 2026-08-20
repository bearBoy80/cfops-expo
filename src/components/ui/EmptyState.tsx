import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, font, label, maxScale, spacing, tint } from '../../theme/tokens';
import { Button } from './Button';

interface Props {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Compact variant for inline placement inside a section or card. */
  compact?: boolean;
}

export function EmptyState({ Icon, title, subtitle, actionLabel, onAction, compact = false }: Props) {
  const { mode, colors } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? spacing.sm : 10,
        paddingHorizontal: 40,
        ...(compact ? { paddingVertical: spacing.xxl } : { flex: 1 }),
      }}
    >
      <View
        style={{
          width: compact ? 44 : 56,
          height: compact ? 44 : 56,
          borderRadius: compact ? 14 : 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint(accent.orange, '22'),
        }}
      >
        <Icon size={compact ? 20 : 26} color={accent.orange} />
      </View>
      <Text
        maxFontSizeMultiplier={maxScale('headline')}
        style={{ ...font(compact ? 'body' : 'headline', '600'), textAlign: 'center', color: colors.text }}
      >
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={maxScale('subhead')}
        style={{ ...font('subhead'), textAlign: 'center', color: label(mode, 0.5) }}
      >
        {subtitle}
      </Text>
      {actionLabel ? (
        <Button label={actionLabel} onPress={onAction} small style={{ alignSelf: 'center', marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}
