import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import {
  accent,
  font,
  foreground,
  maxScale,
  radius,
  spacing,
} from '../../theme/tokens';
import { haptics } from '../../utils/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  Icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  /** Compact height for inline placement (e.g. empty-state CTA). */
  small?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/** Primary/secondary are capsules; destructive is a surface card with a red label. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  Icon,
  disabled = false,
  loading = false,
  small = false,
  style,
  testID,
}: Props) {
  const { colors } = useTheme();

  const background =
    variant === 'primary' ? accent.orange : colors.surface;
  const color =
    variant === 'primary'
      ? foreground.onAccent
      : variant === 'destructive'
        ? accent.red
        : accent.orange;
  const cornerRadius = variant === 'destructive' ? radius.lg : radius.full;
  const inactive = disabled || loading;
  const outerStyle = StyleSheet.flatten(style) ?? {};

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      style={({ pressed }) => ({
        alignSelf: small ? 'flex-start' : 'stretch',
        opacity: inactive ? 0.5 : pressed ? 0.75 : 1,
        transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        ...outerStyle,
      })}
      testID={testID}
    >
      <View
        style={[
          styles.inner,
          {
            backgroundColor: background,
            borderRadius: cornerRadius,
            minHeight: small ? 38 : 48,
            paddingHorizontal: small ? spacing.xl : spacing.xxl,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={color} size="small" />
        ) : Icon ? (
          <View accessibilityElementsHidden>
            <Icon color={color} size={16} />
          </View>
        ) : null}
        <Text
          maxFontSizeMultiplier={maxScale('body')}
          numberOfLines={1}
          style={{ ...font('body', '600'), color }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
});
