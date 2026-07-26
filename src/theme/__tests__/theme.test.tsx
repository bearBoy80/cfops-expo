import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { accent, label } from '../tokens';

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

test('defaults to dark and exposes palette', () => {
  const { result } = renderHook(() => useTheme(), { wrapper });
  expect(result.current.mode).toBe('dark');
  expect(result.current.colors.bg).toBe('#000000');
});

test('setMode switches palette', () => {
  const { result } = renderHook(() => useTheme(), { wrapper });
  act(() => result.current.setMode('light'));
  expect(result.current.colors.bg).toBe('#f2f2f7');
});

test('accent and label helper', () => {
  expect(accent.orange).toBe('#f6821f');
  expect(label('dark', 0.5)).toBe('rgba(255,255,255,0.5)');
});
