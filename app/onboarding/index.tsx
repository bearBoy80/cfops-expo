import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../../src/auth/AuthGate';
import { createAccount } from '../../src/auth/localAccount';
import { AuthTextInput } from '../../src/components/AuthTextInput';
import { useTheme } from '../../src/theme/ThemeContext';
import {
  accent,
  label,
  palettes,
  tint,
} from '../../src/theme/tokens';

export default function Onboarding() {
  const { onOnboardingCompleted } = useAuth();
  const { mode, colors } = useTheme();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await createAccount(name.trim(), password, biometricsEnabled);
      onOnboardingCompleted();
    } catch {
      setError('Could not create the local account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.icon,
              { backgroundColor: tint(accent.orange, '22') },
            ]}
          >
            <ShieldCheck color={accent.orange} size={34} strokeWidth={2} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Create App Account
          </Text>
          <Text style={[styles.subtitle, { color: label(mode, 0.55) }]}>
            This local account protects the console on this device. It is
            separate from your Cloudflare identity.
          </Text>

          <View style={styles.form}>
            <AuthTextInput
              onChangeText={setName}
              placeholder="Your name"
              testID="name"
              textContentType="name"
              value={name}
            />
            <AuthTextInput
              onChangeText={setPassword}
              placeholder="Password (min. 8 characters)"
              secureTextEntry
              testID="password"
              textContentType="newPassword"
              value={password}
            />
            <AuthTextInput
              onChangeText={setConfirm}
              placeholder="Confirm password"
              secureTextEntry
              testID="confirm"
              textContentType="newPassword"
              value={confirm}
            />
          </View>

          <View
            style={[styles.preference, { backgroundColor: colors.surface }]}
          >
            <View style={styles.preferenceCopy}>
              <Text style={[styles.preferenceTitle, { color: colors.text }]}>
                Face ID / fingerprint
              </Text>
              <Text
                style={[styles.preferenceSubtitle, { color: label(mode, 0.5) }]}
              >
                Unlock faster on supported devices
              </Text>
            </View>
            <Switch
              accessibilityLabel="Enable biometric unlock"
              onValueChange={setBiometricsEnabled}
              trackColor={{
                false: colors.surface2,
                true: tint(accent.orange, '88'),
              }}
              thumbColor={
                biometricsEnabled ? accent.orange : label(mode, 0.7)
              }
              value={biometricsEnabled}
            />
          </View>

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={submit}
            style={[
              styles.primaryButton,
              {
                backgroundColor: accent.orange,
                opacity: busy ? 0.62 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: palettes.dark.text },
              ]}
            >
              {busy ? 'Creating…' : 'Create Account'}
            </Text>
          </Pressable>

          <Text style={[styles.footnote, { color: label(mode, 0.42) }]}>
            Your password hash stays in SecureStore and never leaves this
            device.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  error: {
    color: accent.red,
    fontSize: 13,
    marginBottom: 12,
  },
  flex: {
    flex: 1,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 14,
    textAlign: 'center',
  },
  form: {
    gap: 12,
    marginTop: 28,
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 22,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  preference: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    marginBottom: 16,
    marginTop: 16,
    padding: 14,
  },
  preferenceCopy: {
    flex: 1,
    paddingRight: 12,
  },
  preferenceSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  preferenceTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 15,
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    alignSelf: 'center',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 340,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: 22,
    textAlign: 'center',
  },
});
