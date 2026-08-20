/** 1234567 → "1.2M", matching the compact style of the design reference. */
export function compactNumber(value: number): string {
  const scaled = (amount: number, unit: string) =>
    `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)}${unit}`;
  if (value >= 1_000_000_000) {
    return scaled(value / 1_000_000_000, 'B');
  }
  if (value >= 1_000_000) {
    return scaled(value / 1_000_000, 'M');
  }
  if (value >= 1_000) {
    return scaled(value / 1_000, 'K');
  }
  return String(value);
}

/**
 * Compact count rounded to the nearest ten, keeping tens-level precision
 * while still using K/M/B units, e.g. 62234 → "62.23K", 1760 → "1.76K",
 * 124 → "120". Two decimals in the K range preserve the tens digit exactly
 * (0.01K = 10). Used for visits / page views where a coarse "62.2K" hides
 * meaningful precision.
 */
export function preciseTens(value: number): string {
  const rounded = Math.round(value / 10) * 10;
  const withUnit = (amount: number, unit: string) =>
    `${amount.toFixed(2).replace(/\.?0+$/, '')}${unit}`;
  if (rounded < 1_000) {
    try {
      return new Intl.NumberFormat().format(rounded);
    } catch {
      return String(rounded);
    }
  }
  if (rounded < 1_000_000) {
    return withUnit(rounded / 1_000, 'K');
  }
  if (rounded < 1_000_000_000) {
    return withUnit(rounded / 1_000_000, 'M');
  }
  return withUnit(rounded / 1_000_000_000, 'B');
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** "12m ago" / "3h ago" style relative timestamps, translated via t(). */
export function relativeTime(iso: string, t: Translate): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const deltaMs = Math.max(0, Date.now() - then);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return t('time.justNow');
  }
  if (minutes < 60) {
    return t('time.minutesAgo', { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('time.hoursAgo', { count: hours });
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return t('time.daysAgo', { count: days });
  }
  return new Date(iso).toISOString().slice(0, 10);
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      currency,
      maximumFractionDigits: 2,
      style: 'currency',
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Local 24h clock, e.g. "16:38". */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  });
}

export function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const power = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** power;
  return `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)} ${units[power]}`;
}
