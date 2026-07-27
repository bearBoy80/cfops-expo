import { Text, View } from 'react-native';
import { foreground } from '../../theme/tokens';

export function AccountChip({ name, color, size = 26 }: { name: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
      <Text style={{ fontSize: size * 0.42, fontWeight: '700', color: foreground.onAccent }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}
