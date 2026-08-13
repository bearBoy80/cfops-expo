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
