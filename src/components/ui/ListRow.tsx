import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { hairline, label } from '../../theme/tokens';

interface Props {
  left: React.ReactNode;
  right?: React.ReactNode;
  chevron?: boolean;
  last?: boolean;
  onPress?: () => void;
}

export function ListRow({ left, right, chevron = true, last = false, onPress }: Props) {
  const { mode } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 12, minHeight: 44, paddingVertical: 10 }}>
        <View style={{ flex: 1 }}>{left}</View>
        {right}
        {onPress && chevron ? <ChevronRight size={16} color={label(mode, 0.3)} style={{ marginLeft: 6 }} /> : null}
      </View>
      {!last && <View style={{ marginLeft: 16, height: 1, backgroundColor: hairline(mode, 0.08) }} />}
    </Pressable>
  );
}
