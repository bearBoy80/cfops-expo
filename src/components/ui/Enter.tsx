import type { ReactNode } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';

/**
 * One-shot entrance transition for freshly loaded screen content.
 * Plays only when the subtree mounts (first data arrival), not on refresh.
 */
export function Enter({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(260)}>
      {children}
    </Animated.View>
  );
}
