import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { LockKeyhole, ScanFace } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthGate';
import { getAccount, verifyPassword } from '../src/auth/localAccount';
import { AuthTextInput } from '../src/components/AuthTextInput';
import { useTheme } from '../src/theme/ThemeContext';
import { accent, label, palettes, tint } from '../src/theme/tokens';

export default function Unlock() {
  const { unlock } = useAuth();
  const { mode, colors } = useTheme();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  const tryBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      cancelLabel: 'Use password',
      fallbackLabel: 'Use password',
      promptMessage: 'Unlock cloudflareOps',
    });
    if (result.success) {
      unlock();
    }
  };

  useEffect(() => {
    let active = true;

    void getAccount().then((account) => {
      if (!active || !account) {
        return;
      }
      setName(account.name);
      setBiometricsEnabled(account.biometricsEnabled);
      if (account.biometricsEnabled) {
        void tryBiometrics();
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    if (await verifyPassword(password)) {
      setError(null);
      unlock();
      return;
    }

    setError('Incorrect password.');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
      >
        <View
          style={[
            styles.icon,
            { backgroundColor: tint(accent.orange, '22') },
          ]}
        >
          <LockKeyhole color={accent.orange} size={34} strokeWidth={2} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          {name ? `Welcome back, ${name}` : 'Welcome back'}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.52) }]}>
          Unlock your local Cloudflare console.
        </Text>

        <View style={styles.form}>
          <AuthTextInput
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            testID="password"
            textContentType="password"
            value={password}
          />

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={submit}
            style={[
              styles.primaryButton,
              {
                backgroundColor: accent.orange,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: palettes.dark.text },
              ]}
            >
              Unlock
            </Text>
          </Pressable>
        </View>

        {biometricsEnabled ? (
          <Pressable
            accessibilityRole="button"
            onPress={tryBiometrics}
            style={styles.biometricButton}
          >
            <ScanFace color={label(mode, 0.65)} size={19} />
            <Text
              style={[styles.biometricText, { color: label(mode, 0.65) }]}
            >
              Use Face ID / fingerprint
            </Text>
          </Pressable>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  biometricButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginTop: 20,
    padding: 10,
  },
  biometricText: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  error: {
    color: accent.red,
    fontSize: 13,
  },
  form: {
    gap: 12,
    marginTop: 30,
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 22,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 15,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
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
