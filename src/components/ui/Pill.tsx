import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { accent, tint } from '../../theme/tokens';

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

export function Pill({ status }: { status: Status }) {
  const { t } = useTranslation();
  const c = statusColor[status];
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: tint(c, '22'), alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: c }}>{t(`status.${status}`)}</Text>
    </View>
  );
}
