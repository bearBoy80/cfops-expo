import '../global.css';

import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthGateProvider, useAuth } from '../src/auth/AuthGate';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function Gate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    const rootSegment = segments[0] as string | undefined;

    if (status === 'no-account' && rootSegment !== 'onboarding') {
      router.replace('/onboarding');
    } else if (status === 'locked' && rootSegment !== 'unlock') {
      router.replace('/unlock');
    } else if (
      status === 'unlocked' &&
      (rootSegment === 'unlock' || rootSegment === 'onboarding')
    ) {
      router.replace('/(tabs)/(home)');
    }
  }, [router, segments, status]);

  return <>{children}</>;
}

function ThemedStack() {
  const { colors } = useTheme();

  return (
    <Gate>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </Gate>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthGateProvider>
        <ThemedStack />
      </AuthGateProvider>
    </ThemeProvider>
  );
}
