import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { AuthGateProvider, useAuth } from '@/src/auth/AuthGate';
import { routeGuards } from '@/src/auth/routeGuards';
import { ActionMenuHost, ToastProvider } from '@/src/components/ui';
import { applyStoredLanguage } from '@/src/i18n';
import { ThemeProvider, useTheme } from '@/src/theme/ThemeContext';

function AuthenticatedStack() {
  const { status } = useAuth();
  const { colors, mode } = useTheme();
  const guards = routeGuards(status);

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={guards.loading}>
          <Stack.Screen name="loading" />
        </Stack.Protected>
        <Stack.Protected guard={guards.onboarding}>
          <Stack.Screen name="onboarding/index" />
        </Stack.Protected>
        <Stack.Protected guard={guards.unlock}>
          <Stack.Screen name="unlock" />
        </Stack.Protected>
        <Stack.Protected guard={guards.error}>
          <Stack.Screen name="account-error" />
        </Stack.Protected>
        <Stack.Protected guard={guards.tabs}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // The i18n instance boots with the device language at import time; the
  // stored manual override (if any) is applied here, during the loading gate.
  useEffect(() => {
    void applyStoredLanguage();
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider>
        <ThemedRoot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedRoot() {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.bg, flex: 1 }}>
      <ToastProvider>
        <AuthGateProvider>
          <AuthenticatedStack />
        </AuthGateProvider>
        <ActionMenuHost />
      </ToastProvider>
    </View>
  );
}
