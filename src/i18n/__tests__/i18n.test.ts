import en from '../locales/en.json';
import zhHans from '../locales/zh-Hans.json';

const mockStore = new Map<string, string>();

/**
 * Loads a fresh copy of the i18n module with a given device language,
 * so the module-level init picks it up.
 */
const loadI18n = (languageCode: string | null) => {
  jest.resetModules();
  jest.doMock('expo-localization', () => ({
    getLocales: () => (languageCode === null ? [] : [{ languageCode }]),
  }));
  jest.doMock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  }));
  return require('../index') as typeof import('../index');
};

beforeEach(() => {
  mockStore.clear();
});

test('follows a Chinese device language', () => {
  const i18n = loadI18n('zh');
  expect(i18n.systemLanguage()).toBe('zh-Hans');
  expect(i18n.default.language).toBe('zh-Hans');
  expect(i18n.default.t('tabs.settings')).toBe('设置');
});

test('falls back to English for unsupported device languages', () => {
  const i18n = loadI18n('fr');
  expect(i18n.systemLanguage()).toBe('en');
  expect(i18n.default.t('tabs.settings')).toBe('Settings');
});

test('falls back to English when no locale is available', () => {
  const i18n = loadI18n(null);
  expect(i18n.systemLanguage()).toBe('en');
});

test('a manual override persists and applies immediately', async () => {
  const i18n = loadI18n('en');

  await i18n.setAppLanguage('zh-Hans');

  expect(mockStore.get('app-language')).toBe('zh-Hans');
  expect(i18n.default.language).toBe('zh-Hans');
  await expect(i18n.getStoredLanguage()).resolves.toBe('zh-Hans');
});

test('applyStoredLanguage restores the persisted override at startup', async () => {
  mockStore.set('app-language', 'zh-Hans');
  const i18n = loadI18n('en');

  expect(i18n.default.language).toBe('en');
  await i18n.applyStoredLanguage();
  expect(i18n.default.language).toBe('zh-Hans');
});

test('selecting system clears the override effect', async () => {
  const i18n = loadI18n('en');

  await i18n.setAppLanguage('zh-Hans');
  await i18n.setAppLanguage('system');

  expect(mockStore.get('app-language')).toBe('system');
  expect(i18n.default.language).toBe('en');
});

test('an unknown stored value resolves to system', async () => {
  mockStore.set('app-language', 'de');
  const i18n = loadI18n('en');

  await expect(i18n.getStoredLanguage()).resolves.toBe('system');
});

type Resource = { [key: string]: string | Resource };

const flatten = (resource: Resource, prefix = ''): string[] =>
  Object.entries(resource).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : flatten(value, path);
  });

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Collapses `x_one`/`x_other` into the single group name `x`. */
const pluralGroup = (key: string) => key.replace(PLURAL_SUFFIX, '');

const enKeys = flatten(en as Resource);
const zhKeys = flatten(zhHans as Resource);

test('both locales expose the same translation keys', () => {
  const enGroups = new Set(enKeys.map(pluralGroup));
  const zhGroups = new Set(zhKeys.map(pluralGroup));

  expect([...enGroups].filter((key) => !zhGroups.has(key))).toEqual([]);
  expect([...zhGroups].filter((key) => !enGroups.has(key))).toEqual([]);
});

test('english plural keys define both the one and other categories', () => {
  const groups = new Set(
    enKeys.filter((key) => PLURAL_SUFFIX.test(key)).map(pluralGroup),
  );

  for (const group of groups) {
    expect(enKeys).toContain(`${group}_one`);
    expect(enKeys).toContain(`${group}_other`);
  }
});

test('chinese plural keys only use the other category', () => {
  // Intl.PluralRules resolves every count to "other" for zh-Hans, so any
  // further category would be an entry translators could never reach.
  const stray = zhKeys.filter(
    (key) => PLURAL_SUFFIX.test(key) && !key.endsWith('_other'),
  );
  expect(stray).toEqual([]);

  // Counted strings must carry the suffix: a bare key resolves today only
  // because i18next falls back, which hides a genuinely missing plural.
  const counted = new Set(
    enKeys.filter((key) => PLURAL_SUFFIX.test(key)).map(pluralGroup),
  );
  for (const group of counted) {
    expect(zhKeys).toContain(`${group}_other`);
  }
});

test('counted strings interpolate in both locales', () => {
  const cases = [
    'storage.objectsCount',
    'storage.keysCount',
    'storage.tablesCount',
    'common.zoneCount',
  ];

  for (const [languageCode, expected] of [
    ['en', '5'],
    ['zh', '5'],
  ] as const) {
    const i18n = loadI18n(languageCode);
    for (const key of cases) {
      for (const count of [1, 5]) {
        const text = i18n.default.t(key, { count });
        expect(text).not.toBe(key);
        expect(text).toContain(String(count));
      }
      expect(i18n.default.t(key, { count: 5 })).toContain(expected);
    }
  }
});
