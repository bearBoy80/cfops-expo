import { Text, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, font, label, maxScale, radius, spacing, tint } from '../../theme/tokens';
import { Button } from './Button';

interface Props {
  message: string;
  /** Renders a retry button when provided. */
  onRetry?: () => void;
  retryLabel?: string;
}

/** Standard error banner with an optional retry action. */
export function ErrorState({ message, onRetry, retryLabel }: Props) {
  const { mode, colors } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        gap: spacing.sm,
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        padding: spacing.xl,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: tint(accent.red, '22'),
          borderRadius: radius.md,
          height: 40,
          justifyContent: 'center',
          width: 40,
        }}
      >
        <AlertCircle color={accent.red} size={20} />
      </View>
      <Text
        maxFontSizeMultiplier={maxScale('subhead')}
        style={{ ...font('subhead'), color: label(mode, 0.7), textAlign: 'center' }}
      >
        {message}
      </Text>
      {onRetry && retryLabel ? (
        <Button label={retryLabel} onPress={onRetry} small variant="secondary" style={{ alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}

/** Centered inline empty label for a section without content. */
export function InlineEmpty({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={maxScale('subhead')}
      style={{
        ...font('subhead'),
        color: label(mode, 0.4),
        marginTop: spacing.sm,
        paddingHorizontal: 32,
        textAlign: 'center',
      }}
    >
      {children}
    </Text>
  );
}
