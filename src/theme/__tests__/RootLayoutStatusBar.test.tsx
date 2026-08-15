import React from 'react';
import { render, screen } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

let mockThemeMode: 'dark' | 'light' = 'dark';

jest.mock('@/global.css', () => ({}));

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stack = ({ children }: { children: React.ReactNode }) => (
    <View>{children}</View>
  );
  Stack.Protected = ({ children }: { children: React.ReactNode }) => (
    <View>{children}</View>
  );
  Stack.Screen = () => null;
  return { Stack };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: ({ style }: { style: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text testID="status-bar-style">{style}</Text>;
  },
}));

jest.mock('../../auth/AuthGate', () => ({
  AuthGateProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: 'loading' }),
}));

jest.mock('../ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    colors: { bg: mockThemeMode === 'dark' ? '#000000' : '#f2f2f7' },
    mode: mockThemeMode,
  }),
}));

test('keeps the Expo status bar legible when the current theme changes', () => {
  mockThemeMode = 'dark';
  const view = render(<RootLayout />);
  expect(screen.getByTestId('status-bar-style').props.children).toBe('light');

  mockThemeMode = 'light';
  view.rerender(<RootLayout />);
  expect(screen.getByTestId('status-bar-style').props.children).toBe('dark');
});
