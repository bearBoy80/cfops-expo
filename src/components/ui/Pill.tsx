import { Text, View } from 'react-native';
import { accent, tint } from '../../theme/tokens';

export type Status = 'active' | 'healthy' | 'pending' | 'paused' | 'degraded' | 'error' | 'block' | 'challenge' | 'log';

export const statusColor: Record<Status, string> = {
  active: accent.green,
  healthy: accent.green,
  pending: accent.yellow,
  paused: accent.yellow,
  degraded: accent.yellow,
  challenge: accent.yellow,
  error: accent.red,
  block: accent.red,
  log: accent.gray,
};

export function Pill({ status }: { status: Status }) {
  const c = statusColor[status];
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: tint(c, '22'), alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: c }}>{status}</Text>
    </View>
  );
}
