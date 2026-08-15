import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, hairline } from '../../theme/tokens';

export type ToastKind = 'success' | 'error';

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

// No-op fallback keeps consumers (and tests) working without the provider.
const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// Errors carry longer messages and higher stakes, so they linger.
const SUCCESS_VISIBLE_MS = 2400;
const ERROR_VISIBLE_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  // Read the context directly so the provider also works in environments
  // without a SafeAreaProvider (e.g. unit tests rendering the root layout).
  const insets = useContext(SafeAreaInsetsContext) ?? {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
  const { mode, colors } = useTheme();
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setToast(null);
      }
    });
  }, [opacity]);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      if (!message.trim()) {
        return;
      }
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      setToast({ message, kind });
      opacity.setValue(0);
      Animated.spring(opacity, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 260,
        mass: 0.7,
      }).start();
      hideTimer.current = setTimeout(
        dismiss,
        kind === 'error' ? ERROR_VISIBLE_MS : SUCCESS_VISIBLE_MS,
      );
    },
    [dismiss, opacity],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);
  const Icon = toast?.kind === 'error' ? AlertCircle : CheckCircle2;
  const iconColor = toast?.kind === 'error' ? accent.red : accent.green;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          pointerEvents="box-none"
          style={[
            styles.wrap,
            {
              opacity,
              top: insets.top + 8,
              transform: [
                {
                  translateY: opacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-16, 0],
                  }),
                },
                {
                  scale: opacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            accessibilityRole="alert"
            onPress={dismiss}
            style={[
              styles.toast,
              {
                backgroundColor: colors.surface2,
                borderColor: hairline(mode, 0.16),
              },
            ]}
            testID="toast"
          >
            <Icon color={iconColor} size={18} />
            <Text numberOfLines={3} style={[styles.text, { color: colors.text }]} testID="toast-message">
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  text: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  toast: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    flexDirection: 'row',
    gap: 10,
    maxWidth: 360,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  wrap: {
    alignItems: 'center',
    left: 16,
    position: 'absolute',
    right: 16,
    zIndex: 100,
  },
});
