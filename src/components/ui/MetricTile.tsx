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
    <View style={{ flex: 1, borderRadius: 16, padding: 14, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        {Icon ? (
          <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(color, '22') }}>
            <Icon size={14} color={color} />
          </View>
        ) : null}
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, fontWeight: '500', color: label(mode, 0.5) }}>{title}</Text>
      </View>
      <Text style={{ fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0.2, color: colors.text }}>{value}</Text>
      {sub ? <Text numberOfLines={1} style={{ fontSize: 11, marginTop: 3, color: label(mode, 0.4) }}>{sub}</Text> : null}
    </View>
  );
}
