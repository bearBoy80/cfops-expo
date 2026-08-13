import { Switch, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, hairline, label, tint } from '../../theme/tokens';

interface Props {
  Icon?: LucideIcon;
  color?: string;
  label: string;
  sub?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  last?: boolean;
  testID?: string;
}

export function ToggleRow({
  Icon,
  color = accent.orange,
  label: title,
  sub,
  value,
  onValueChange,
  disabled = false,
  last = false,
  testID,
}: Props) {
  const { mode, colors } = useTheme();

  return (
    <View>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        {Icon ? (
          <View
            style={{
              alignItems: 'center',
              backgroundColor: tint(color, '22'),
              borderRadius: 8,
              height: 32,
              justifyContent: 'center',
              width: 32,
            }}
          >
            <Icon accessibilityElementsHidden color={color} size={16} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
            {title}
          </Text>
          {sub ? (
            <Text style={{ color: label(mode, 0.45), fontSize: 12, marginTop: 1 }}>
              {sub}
            </Text>
          ) : null}
        </View>
        <Switch
          accessibilityLabel={title}
          disabled={disabled}
          onValueChange={onValueChange}
          testID={testID}
          trackColor={{ false: colors.surface2, true: accent.green }}
          value={value}
        />
      </View>
      {!last && (
        <View
          style={{
            backgroundColor: hairline(mode, 0.08),
            height: 1,
            marginLeft: 16,
          }}
        />
      )}
    </View>
  );
}
