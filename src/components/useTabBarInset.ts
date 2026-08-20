import { useContext } from 'react';
import { Platform } from 'react-native';
// Expo Router vendors react-navigation, so the height context must come from
// the same vendored module instance that the Tabs navigator provides.
import { BottomTabBarHeightContext } from 'expo-router/build/react-navigation/bottom-tabs';
import { spacing } from '../theme/tokens';

/**
 * Bottom padding for scroll content inside the tab navigator.
 *
 * On iOS the tab bar is translucent and absolutely positioned, so content
 * scrolls underneath it and needs the bar height added to its padding.
 * Elsewhere the bar occupies layout space and only the base padding applies.
 * Falls back to the base padding when rendered outside a tab navigator
 * (e.g. in tests).
 */
export function useTabBarInset(base: number = spacing.xxl + spacing.sm): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  return Platform.OS === 'ios' ? base + tabBarHeight : base;
}

/**
 * Bottom offset for an element pinned above the tab bar.
 *
 * Same split as {@link useTabBarInset}: on iOS the translucent bar floats over
 * the content, so an overlay has to clear its height to avoid sitting behind
 * it; elsewhere the bar already occupies layout space.
 */
export function useTabBarOverlayOffset(): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  return Platform.OS === 'ios' ? tabBarHeight : 0;
}
