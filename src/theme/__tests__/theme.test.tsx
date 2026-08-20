import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { accent, font, label, maxScale, radius, spacing } from '../tokens';

let mockSystemScheme: 'dark' | 'light' | null = 'dark';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockSystemScheme,
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockSystemScheme = 'dark';
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue();
});

test('follows the system scheme by default', () => {
  const { result } = renderHook(() => useTheme(), { wrapper });
  expect(result.current.preference).toBe('system');
  expect(result.current.mode).toBe('dark');
  expect(result.current.colors.bg).toBe('#000000');
});

test('system preference tracks the device scheme', () => {
  mockSystemScheme = 'light';
  const { result } = renderHook(() => useTheme(), { wrapper });
  expect(result.current.mode).toBe('light');
  expect(result.current.colors.bg).toBe('#f2f2f7');
});

test('setPreference overrides the system scheme and persists', async () => {
  const { result } = renderHook(() => useTheme(), { wrapper });
  act(() => result.current.setPreference('light'));
  expect(result.current.mode).toBe('light');
  expect(result.current.colors.bg).toBe('#f2f2f7');
  await waitFor(() =>
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('app-theme', 'light'),
  );
});

test('restores a stored explicit preference on mount', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('light');
  const { result } = renderHook(() => useTheme(), { wrapper });
  await waitFor(() => expect(result.current.mode).toBe('light'));
});

test('accent and label helper', () => {
  expect(accent.orange).toBe('#f6821f');
  expect(label('dark', 0.5)).toBe('rgba(255,255,255,0.5)');
});

test('layout and typography tokens', () => {
  expect(spacing.lg).toBe(16);
  expect(radius.lg).toBe(16);
  expect(font('largeTitle').fontSize).toBe(28);
  expect(font('body', '600').fontWeight).toBe('600');
  expect(maxScale('body')).toBeGreaterThan(1);
});
