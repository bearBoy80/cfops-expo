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
  /** Long-press hook, typically presenting a context action menu. */
  onLongPress?: () => void;
  /** Set when the row discloses content, so screen readers announce it. */
  expanded?: boolean;
  testID?: string;
}

export function ListRow({ left, right, chevron = true, last = false, onPress, onLongPress, expanded, testID }: Props) {
  const { mode } = useTheme();
  const interactive = Boolean(onPress ?? onLongPress);
  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!interactive}
      // iOS-style row highlight instead of a bare opacity fade.
      style={({ pressed }) => ({
        backgroundColor: pressed && interactive ? label(mode, 0.07) : 'transparent',
      })}
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
