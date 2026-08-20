export type Mode = 'dark' | 'light';
export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  tabbar: string;
  text: string;
  labelRgb: string;
  hairlineRgb: string;
  searchBg: string;
}

export const palettes: Record<Mode, Palette> = {
  dark:  { bg: '#000000', surface: '#1c1c1e', surface2: '#2c2c2e', tabbar: '#161618',   text: '#ffffff', labelRgb: '255,255,255', hairlineRgb: '255,255,255', searchBg: 'rgba(118,118,128,0.24)' },
  light: { bg: '#f2f2f7', surface: '#ffffff', surface2: '#e5e5ea', tabbar: '#f9f9f9', text: '#000000', labelRgb: '0,0,0',       hairlineRgb: '0,0,0',       searchBg: 'rgba(118,118,128,0.12)' },
};

export const accent = { orange: '#f6821f', green: '#30d158', red: '#ff453a', yellow: '#ffd60a', blue: '#0a84ff', purple: '#bf5af2', gray: '#8e8e93' } as const;
export const foreground = { onAccent: '#ffffff' } as const;

export const label = (mode: Mode, alpha: number) => `rgba(${palettes[mode].labelRgb},${alpha})`;
export const hairline = (mode: Mode, alpha: number) => `rgba(${palettes[mode].hairlineRgb},${alpha})`;
export const tint = (hex: string, alphaHex: string) => hex + alphaHex;

/** Spacing scale (pt). Use instead of ad-hoc margins/paddings. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

/** Corner radius scale (pt). `full` produces a capsule. */
export const radius = { xs: 8, sm: 10, md: 14, lg: 16, xl: 24, full: 999 } as const;

export interface TypeToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing?: number;
  /**
   * Dynamic Type cap for this role; pass as `maxFontSizeMultiplier`.
   * Body copy scales further than large display text.
   */
  maxScale: number;
}

/** Typography scale, loosely mapped to iOS text styles. */
export const typeScale = {
  largeTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5, maxScale: 1.3 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.2, maxScale: 1.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', maxScale: 1.5 },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400', maxScale: 1.6 },
  subhead: { fontSize: 13, lineHeight: 18, fontWeight: '400', maxScale: 1.6 },
  footnote: { fontSize: 12, lineHeight: 16, fontWeight: '400', maxScale: 1.6 },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '400', maxScale: 1.5 },
} as const satisfies Record<string, TypeToken>;

export type TypeRole = keyof typeof typeScale;

/**
 * Text style for a typography role, with optional weight override.
 * Spread into a `Text` style; pair with `maxScale(role)` for Dynamic Type.
 */
export function font(
  role: TypeRole,
  weight?: TypeToken['fontWeight'],
): {
  fontSize: number;
  lineHeight: number;
  fontWeight: TypeToken['fontWeight'];
  letterSpacing?: number;
} {
  const { maxScale: _max, ...style } = typeScale[role];
  return weight ? { ...style, fontWeight: weight } : style;
}

/** Dynamic Type cap for a role; pass as `maxFontSizeMultiplier`. */
export function maxScale(role: TypeRole): number {
  return typeScale[role].maxScale;
}
