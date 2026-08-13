import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent } from '../../theme/tokens';

export type ToastKind = 'success' | 'error';

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

// No-op fallback keeps consumers (and tests) working without the provider.
const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const VISIBLE_MS = 2800;

export function ToastProvider({ children }: { children: ReactNode }) {
  // Read the context directly so the provider also works in environments
  // without a SafeAreaProvider (e.g. unit tests rendering the root layout).
  const insets = useContext(SafeAreaInsetsContext) ?? {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
  const { colors } = useTheme();
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      setToast({ message, kind });
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            setToast(null);
          }
        });
      }, VISIBLE_MS);
    },
    [opacity],
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
          pointerEvents="none"
          style={[
            styles.wrap,
            {
              opacity,
              top: insets.top + 8,
              transform: [
                {
                  translateY: opacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.toast, { backgroundColor: colors.surface2 }]}>
            <Icon color={iconColor} size={18} />
            <Text numberOfLines={2} style={[styles.text, { color: colors.text }]} testID="toast-message">
              {toast.message}
            </Text>
          </View>
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
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 360,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  wrap: {
    alignItems: 'center',
    left: 16,
    position: 'absolute',
    right: 16,
    zIndex: 100,
  },
});
