import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, foreground, label, tint } from '../../theme/tokens';

interface Props {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ Icon, title, subtitle, actionLabel, onAction }: Props) {
  const { mode, colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(accent.orange, '22') }}>
        <Icon size={26} color={accent.orange} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 13, textAlign: 'center', lineHeight: 18, color: label(mode, 0.5) }}>{subtitle}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} style={({ pressed }) => ({ marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: accent.orange, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: foreground.onAccent }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
