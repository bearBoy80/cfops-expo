import {
  compactNumber,
  formatBytes,
  formatClock,
  formatCurrency,
  preciseTens,
  relativeTime,
} from '../format';

const t = (key: string, options?: Record<string, unknown>) =>
  options?.count !== undefined ? `${key}:${options.count}` : key;

describe('relativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('maps deltas to the matching translation key', () => {
    expect(relativeTime('2026-08-13T11:59:40Z', t)).toBe('time.justNow');
    expect(relativeTime('2026-08-13T11:48:00Z', t)).toBe('time.minutesAgo:12');
    expect(relativeTime('2026-08-13T09:00:00Z', t)).toBe('time.hoursAgo:3');
    expect(relativeTime('2026-08-10T12:00:00Z', t)).toBe('time.daysAgo:3');
  });

  test('falls back to the plain date after 30 days', () => {
    expect(relativeTime('2026-05-01T00:00:00Z', t)).toBe('2026-05-01');
  });

  test('returns an empty string for invalid dates', () => {
    expect(relativeTime('not-a-date', t)).toBe('');
  });
});

describe('preciseTens', () => {
  test('rounds to the nearest ten and keeps K/M units', () => {
    expect(preciseTens(124)).toBe('120');
    expect(preciseTens(62234)).toBe('62.23K');
    expect(preciseTens(1760)).toBe('1.76K');
    expect(preciseTens(5000)).toBe('5K');
    expect(preciseTens(1_234_567)).toBe('1.23M');
  });
});

describe('formatClock', () => {
  test('returns an empty string for invalid dates', () => {
    expect(formatClock('not-a-date')).toBe('');
  });

  test('formats a valid timestamp', () => {
    expect(formatClock('2026-08-14T16:38:00Z')).toMatch(/\d{2}:\d{2}/);
  });
});

describe('compactNumber', () => {
  test('keeps one decimal below 100 of a unit', () => {
    expect(compactNumber(999)).toBe('999');
    expect(compactNumber(24_800)).toBe('24.8K');
    expect(compactNumber(2_100_000)).toBe('2.1M');
    expect(compactNumber(6_400_000_000)).toBe('6.4B');
  });
});

describe('formatCurrency', () => {
  test('formats a USD amount', () => {
    expect(formatCurrency(5, 'USD')).toMatch(/5/);
  });
});

describe('formatBytes', () => {
  test('picks a readable unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3_200_000_000)).toBe('3.0 GB');
  });
});
