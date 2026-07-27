import { Pressable, Text, View } from 'react-native';
import { createAccount } from '../../src/auth/localAccount';
import { useAuth } from '../../src/auth/AuthGate';
import { useTheme } from '../../src/theme/ThemeContext';
import { accent } from '../../src/theme/tokens';

export default function Onboarding() {
  const { onAccountCreated } = useAuth();
  const { colors } = useTheme();

  const createPlaceholderAccount = async () => {
    await createAccount('Placeholder', 'placeholder-pass', false);
    onAccountCreated();
  };

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
      }}
    >
      <Pressable onPress={createPlaceholderAccount}>
        <Text style={{ color: accent.orange }}>
          Create account (placeholder)
        </Text>
      </Pressable>
    </View>
  );
}
