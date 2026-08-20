import { memo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { accent, font, maxScale, tint } from '../../theme/tokens';

export type Status = 'active' | 'healthy' | 'pending' | 'paused' | 'degraded' | 'error' | 'block' | 'challenge' | 'log';

export const statusColor: Record<Status, string> = {
  active: accent.green,
  healthy: accent.green,
  pending: accent.blue,
  paused: accent.yellow,
  degraded: accent.yellow,
  challenge: accent.yellow,
  error: accent.red,
  block: accent.red,
  log: accent.blue,
};

export const Pill = memo(function Pill({ status }: { status: Status }) {
  const { t } = useTranslation();
  const c = statusColor[status];
  const text = t(`status.${status}`);
  return (
    <View
      accessibilityLabel={text}
      style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: tint(c, '22'), alignSelf: 'flex-start' }}
    >
      <Text maxFontSizeMultiplier={maxScale('caption')} style={{ ...font('caption', '600'), color: c }}>{text}</Text>
    </View>
  );
});
