import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Mode, Palette, palettes } from './tokens';

/** User-facing preference: an explicit mode, or follow the device. */
export type ThemePreference = 'system' | Mode;

interface ThemeValue {
  /** Resolved mode, taking the system scheme into account. */
  mode: Mode;
  colors: Palette;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const THEME_STORAGE_KEY = 'app-theme';

export async function getStoredThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' || stored === 'system'
      ? stored
      : 'system';
  } catch {
    // An unreadable preference falls back to the device scheme.
    return 'system';
  }
}

const ThemeCtx = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    void getStoredThemePreference().then((stored) => {
      if (active && stored !== 'system') {
        setPreferenceState(stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void SecureStore.setItemAsync(THEME_STORAGE_KEY, next).catch(() => {
      // Persistence failures still apply the choice for this session.
    });
  }, []);

  const mode: Mode =
    preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo(
    () => ({ mode, colors: palettes[mode], preference, setPreference }),
    [mode, preference, setPreference],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme must be used within ThemeProvider');
  return v;
}
