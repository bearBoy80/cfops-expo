import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Haptics are a garnish: failures (web, simulators, disabled hardware)
// must never surface to the caller.
const run = (effect: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  try {
    void effect().catch(() => {});
  } catch {
    // Native module unavailable (e.g. tests without mocks).
  }
};

/** Semantic haptic vocabulary used across the app. */
export const haptics = {
  /** Picker/segment/tab selection changes. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** Light tap for button presses and pull-to-refresh triggers. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium tap for long-press menus and sheet presentation. */
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
