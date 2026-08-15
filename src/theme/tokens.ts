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
