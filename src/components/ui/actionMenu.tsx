import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  SafeAreaInsetsContext,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { accent, font, hairline, label, maxScale } from '../../theme/tokens';
import { haptics } from '../../utils/haptics';

export interface ActionMenuItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface ActionMenuOptions {
  title: string;
  message?: string;
  cancelLabel: string;
  actions: ActionMenuItem[];
}

type Listener = (options: ActionMenuOptions) => void;

let listener: Listener | null = null;

/**
 * Presents a bottom action sheet (classic iOS style) hosted by
 * `ActionMenuHost`, which must be mounted once near the app root.
 */
export function showActionMenu(options: ActionMenuOptions): void {
  haptics.press();
  listener?.(options);
}

const SLIDE_DISTANCE = 80;
const DISMISS_DRAG_DISTANCE = 90;
const DISMISS_VELOCITY = 800;

export function ActionMenuHost() {
  // The host is mounted outside the router tree, where SafeAreaProvider is
  // not available, so fall back to the window metrics captured at startup.
  const insets = useContext(SafeAreaInsetsContext) ??
    initialWindowMetrics?.insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const { mode, colors } = useTheme();
  const [menu, setMenu] = useState<ActionMenuOptions | null>(null);
  /** Handler of the tapped action, held until the sheet is off screen. */
  const pending = useRef<(() => void) | null>(null);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    listener = (options) => {
      // A menu opened mid-dismissal cancels the close animation, so the held
      // handler would never be reached. Drop it rather than run it later
      // against whatever menu is on screen by then.
      pending.current = null;
      setMenu(options);
      progress.value = 0;
      dragY.value = 0;
      progress.value = withTiming(1, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      });
    };
    return () => {
      listener = null;
    };
  }, [dragY, progress]);

  const unmount = useCallback(() => {
    setMenu(null);
  }, []);

  /*
   * The action runs only once the sheet is gone, matching how iOS sheets
   * behave. It also has to: this host is a `Modal`, and an action that presents
   * its own modal — the KV value editor, say — cannot do so while this one is
   * still up. Both would fail to appear and the stale modal window would keep
   * swallowing touches, leaving the screen frozen.
   */
  useEffect(() => {
    if (menu !== null) {
      return;
    }
    const action = pending.current;
    if (!action) {
      return;
    }
    pending.current = null;
    // A frame after the dismissal commits, because iOS tears the modal's view
    // controller down asynchronously: presenting the next one in the same tick
    // hits the very race described above.
    const frame = requestAnimationFrame(action);
    return () => cancelAnimationFrame(frame);
  }, [menu]);

  const close = useCallback(
    (after?: () => void) => {
      pending.current = after ?? null;
      progress.value = withTiming(
        0,
        { duration: 180, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(unmount)();
          }
        },
      );
    },
    [progress, unmount],
  );

  const pan = Gesture.Pan()
    .onChange((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (dragY.value > DISMISS_DRAG_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(close)();
      } else {
        dragY.value = withSpring(0, { damping: 22, stiffness: 320 });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * SLIDE_DISTANCE + dragY.value },
    ],
  }));

  if (!menu) {
    return null;
  }

  const separator = (
    <View
      style={[styles.separator, { backgroundColor: hairline(mode, 0.2) }]}
    />
  );

  return (
    <Modal
      animationType="none"
      onRequestClose={() => close()}
      transparent
      visible
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityLabel={menu.cancelLabel}
            accessibilityRole="button"
            onPress={() => close()}
            style={StyleSheet.absoluteFill}
            testID="action-menu-backdrop"
          />
        </Animated.View>
        <View pointerEvents="box-none" style={styles.wrap}>
          <GestureDetector gesture={pan}>
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.sheet,
                { paddingBottom: insets.bottom + 8 },
                sheetStyle,
              ]}
            >
              <View style={[styles.group, { backgroundColor: colors.surface2 }]}>
                <View style={styles.header}>
                  <View
                    style={[styles.grabber, { backgroundColor: label(mode, 0.25) }]}
                  />
                  <Text
                    maxFontSizeMultiplier={maxScale('subhead')}
                    numberOfLines={1}
                    style={[styles.title, { color: label(mode, 0.55) }]}
                  >
                    {menu.title}
                  </Text>
                  {menu.message ? (
                    <Text
                      maxFontSizeMultiplier={maxScale('subhead')}
                      style={[styles.message, { color: label(mode, 0.55) }]}
                    >
                      {menu.message}
                    </Text>
                  ) : null}
                </View>
                {menu.actions.map((action) => (
                  <View key={action.label}>
                    {separator}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (action.destructive) {
                          haptics.warning();
                        } else {
                          haptics.selection();
                        }
                        close(action.onPress);
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: pressed
                          ? label(mode, 0.06)
                          : 'transparent',
                      })}
                      testID={`action-menu-${action.label}`}
                    >
                      <View style={styles.action}>
                        <Text
                          maxFontSizeMultiplier={maxScale('headline')}
                          numberOfLines={1}
                          style={[
                            styles.actionLabel,
                            {
                              color: action.destructive
                                ? accent.red
                                : colors.text,
                            },
                          ]}
                        >
                          {action.label}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => close()}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                testID="action-menu-cancel"
              >
                <View style={[styles.cancel, { backgroundColor: colors.surface2 }]}>
                  <Text
                    maxFontSizeMultiplier={maxScale('headline')}
                    style={[styles.cancelLabel, { color: colors.text }]}
                  >
                    {menu.cancelLabel}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  actionLabel: {
    fontSize: 19,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cancel: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 56,
  },
  cancelLabel: {
    fontSize: 19,
    fontWeight: '600',
  },
  grabber: {
    borderRadius: 3,
    height: 5,
    marginBottom: 6,
    width: 36,
  },
  group: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  message: {
    ...font('subhead'),
    textAlign: 'center',
  },
  root: {
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  sheet: {
    paddingHorizontal: 8,
  },
  title: {
    ...font('subhead', '600'),
  },
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
