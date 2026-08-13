import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { hairline, label } from '../../theme/tokens';

interface Props {
  left: React.ReactNode;
  right?: React.ReactNode;
  chevron?: boolean;
  last?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function ListRow({ left, right, chevron = true, last = false, onPress, testID }: Props) {
  const { mode } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      testID={testID}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 16, minHeight: 44, paddingVertical: 11 }}>
        <View style={{ flex: 1 }}>{left}</View>
        {right}
        {onPress && chevron ? <ChevronRight size={18} color={label(mode, 0.3)} style={{ marginLeft: 8 }} /> : null}
      </View>
      {!last && <View style={{ marginLeft: 16, height: StyleSheet.hairlineWidth, backgroundColor: hairline(mode, 0.16) }} />}
    </Pressable>
  );
}
