import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { ThemeProvider, useTheme } from '../ThemeContext';
import {
  accent,
  font,
  fontFace,
  label,
  maxScale,
  radius,
  spacing,
  typeScale,
} from '../tokens';

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

test('font carries the leading, fontFace leaves it to the platform', () => {
  // Screen styles were authored without a lineHeight. Adopting the scale must
  // not silently set one, or every screen's vertical rhythm shifts.
  expect(font('body')).toMatchObject({ fontSize: 15, lineHeight: 20 });
  expect(fontFace('body')).toEqual({ fontSize: 15, fontWeight: '400' });
  expect('lineHeight' in fontFace('subhead')).toBe(false);
});

test('every role the screens use is on the scale', () => {
  // Sizes the routes rely on; a missing one sends someone back to a literal.
  const sizes = Object.values(typeScale).map((token) => token.fontSize);
  for (const size of [11, 12, 13, 14, 15, 16, 17, 22, 28, 34]) {
    expect(sizes).toContain(size);
  }
});

test('a weight override never changes the size or tracking', () => {
  expect(fontFace('headline', '400')).toEqual({
    fontSize: 17,
    fontWeight: '400',
  });
  expect(font('title', '600')).toEqual({
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: 0.2,
  });
});
