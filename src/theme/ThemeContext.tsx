import { createContext, useContext, useMemo, useState } from 'react';
import { Mode, Palette, palettes } from './tokens';

interface ThemeValue {
  mode: Mode;
  colors: Palette;
  setMode: (m: Mode) => void;
}

const ThemeCtx = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('dark');
  const value = useMemo(() => ({ mode, colors: palettes[mode], setMode }), [mode]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme must be used within ThemeProvider');
  return v;
}
