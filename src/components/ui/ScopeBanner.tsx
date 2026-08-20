import { Pressable, StyleSheet, Text } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { setAccountScope } from '../../state/accountScope';
import { haptics } from '../../utils/haptics';
import { accent, maxScale, tint } from '../../theme/tokens';

/**
 * Visible indicator that the global account filter is active. The filter is
 * set by tapping an account row on Home — easy to do without noticing — and
 * would otherwise make the other tabs look like resources went missing.
 * Tapping the banner clears the filter in place.
 */
export function ScopeBanner({ name }: { name: string | null }) {
  const { t } = useTranslation();
  if (!name) {
    return null;
  }
  return (
    <Pressable
      accessibilityLabel={t('common.clearAccountFilter')}
      accessibilityRole="button"
      onPress={() => {
        haptics.tap();
        setAccountScope(null);
      }}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: tint(accent.orange, pressed ? '38' : '22') },
      ]}
      testID="scope-banner"
    >
      <Text
        maxFontSizeMultiplier={maxScale('footnote')}
        numberOfLines={1}
        style={[styles.text, { color: accent.orange }]}
      >
        {t('common.scopedTo', { name })}
      </Text>
      <X color={accent.orange} size={13} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
});
