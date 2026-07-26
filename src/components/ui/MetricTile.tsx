import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { label, tint } from '../../theme/tokens';

interface Props {
  label: string;
  value: string;
  sub?: string;
  color: string;
  Icon?: LucideIcon;
}

export function MetricTile({ label: title, value, sub, color, Icon }: Props) {
  const { mode, colors } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {Icon ? (
          <View style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(color, '22') }}>
            <Icon size={13} color={color} />
          </View>
        ) : null}
        <Text style={{ fontSize: 11, color: label(mode, 0.5) }}>{title}</Text>
      </View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 10, marginTop: 2, color: label(mode, 0.4) }}>{sub}</Text> : null}
    </View>
  );
}
