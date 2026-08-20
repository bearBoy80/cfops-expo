import { StyleSheet, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import {
  accent,
  font,
  label,
  maxScale,
  radius,
  spacing,
  tint,
} from '../../theme/tokens';
import { Button } from './Button';

interface Props {
  /** Short headline, e.g. "Additional permission required". */
  title: string;
  /** Explains which permission is missing and how to fix it. */
  message: string;
  /** Optional call to action (e.g. open the Cloudflare token settings). */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Inline banner shown when a Cloudflare credential is missing a permission.
 * Reusable across screens that can detect a `forbidden` API error.
 */
export function PermissionNotice({
  title,
  message,
  actionLabel,
  onAction,
}: Props) {
  const { mode, colors } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[styles.card, { backgroundColor: tint(accent.orange, '1f') }]}
    >
      <View style={styles.row}>
        <ShieldAlert color={accent.orange} size={18} />
        <Text
          maxFontSizeMultiplier={maxScale('subhead')}
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
      </View>
      <Text
        maxFontSizeMultiplier={maxScale('footnote')}
        style={[styles.body, { color: label(mode, 0.6) }]}
      >
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          small
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    ...font('footnote'),
  },
  card: {
    borderRadius: radius.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    ...font('subhead', '600'),
    flexShrink: 1,
  },
});
