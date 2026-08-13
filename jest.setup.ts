// Tests always run with a fixed English locale so copy assertions are stable.
// This only registers the mock factory; the module is instantiated lazily
// inside each test file, so files can still override it with their own mock.
jest.mock('expo-localization', () => ({
  getLocales: () => [
    { languageCode: 'en', languageTag: 'en-US' },
  ],
}));

// Initialize the shared i18next instance directly (without importing
// src/i18n, which would eagerly instantiate expo-secure-store and shadow
// per-test mocks). Components under test share this singleton through
// react-i18next; importing src/i18n later re-inits it with the same values.
require('intl-pluralrules');
/* eslint-disable @typescript-eslint/no-var-requires */
const i18nextModule = require('i18next') as typeof import('i18next');
const i18next = i18nextModule.default ?? i18nextModule;
const { initReactI18next } =
  require('react-i18next') as typeof import('react-i18next');
const en = require('./src/i18n/locales/en.json') as object;
const zhHans = require('./src/i18n/locales/zh-Hans.json') as object;

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-Hans': { translation: zhHans },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
});

export {};
