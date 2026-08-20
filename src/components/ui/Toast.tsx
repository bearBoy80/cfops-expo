import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, font, hairline, maxScale } from '../../theme/tokens';
import { haptics } from '../../utils/haptics';

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
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    // Unmounting triggers the exiting animation.
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      if (!message.trim()) {
        return;
      }
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      if (kind === 'error') {
        haptics.error();
      } else {
        haptics.success();
      }
      setToast({ message, kind });
      hideTimer.current = setTimeout(
        dismiss,
        kind === 'error' ? ERROR_VISIBLE_MS : SUCCESS_VISIBLE_MS,
      );
    },
    [dismiss],
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
          entering={FadeInUp.springify().damping(18).stiffness(260).mass(0.7)}
          exiting={FadeOutUp.duration(180)}
          pointerEvents="box-none"
          style={[styles.wrap, { top: insets.top + 8 }]}
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
            <Text
              maxFontSizeMultiplier={maxScale('body')}
              numberOfLines={3}
              style={[styles.text, { color: colors.text }]}
              testID="toast-message"
            >
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
    ...font('body', '500'),
    flexShrink: 1,
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
