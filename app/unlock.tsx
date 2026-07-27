import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../src/auth/AuthGate';
import { useTheme } from '../src/theme/ThemeContext';
import { accent } from '../src/theme/tokens';

export default function Unlock() {
  const { unlock } = useAuth();
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
      }}
    >
      <Pressable onPress={unlock}>
        <Text style={{ color: accent.orange }}>Unlock (placeholder)</Text>
      </Pressable>
    </View>
  );
}
