import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaInsetsContext,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { accent, hairline, label } from '../../theme/tokens';

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
  listener?.(options);
}

const SLIDE_DISTANCE = 80;

export function ActionMenuHost() {
  // The host is mounted outside the router tree, where SafeAreaProvider is
  // not available, so fall back to the window metrics captured at startup.
  const insets = useContext(SafeAreaInsetsContext) ??
    initialWindowMetrics?.insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const { mode, colors } = useTheme();
  const [menu, setMenu] = useState<ActionMenuOptions | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listener = (options) => {
      setMenu(options);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    return () => {
      listener = null;
    };
  }, [progress]);

  const close = (after?: () => void) => {
    after?.();
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMenu(null);
      }
    });
  };

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
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable
          onPress={() => close()}
          style={StyleSheet.absoluteFill}
          testID="action-menu-backdrop"
        />
      </Animated.View>
      <View pointerEvents="box-none" style={styles.wrap}>
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 8,
              opacity: progress,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [SLIDE_DISTANCE, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.group, { backgroundColor: colors.surface2 }]}>
            <View style={styles.header}>
              <Text
                numberOfLines={1}
                style={[styles.title, { color: label(mode, 0.55) }]}
              >
                {menu.title}
              </Text>
              {menu.message ? (
                <Text style={[styles.message, { color: label(mode, 0.55) }]}>
                  {menu.message}
                </Text>
              ) : null}
            </View>
            {menu.actions.map((action) => (
              <View key={action.label}>
                {separator}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => close(action.onPress)}
                  style={styles.action}
                  testID={`action-menu-${action.label}`}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.actionLabel,
                      { color: action.destructive ? accent.red : colors.text },
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => close()}
            style={[styles.cancel, { backgroundColor: colors.surface2 }]}
            testID="action-menu-cancel"
          >
            <Text style={[styles.cancelLabel, { color: colors.text }]}>
              {menu.cancelLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
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
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  sheet: {
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
