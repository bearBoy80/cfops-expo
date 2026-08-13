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
