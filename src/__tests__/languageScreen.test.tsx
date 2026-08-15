import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import LanguageScreen from '@/app/(tabs)/(settings)/language';
import i18n, { setAppLanguage } from '../i18n';
import { ThemeProvider } from '../theme/ThemeContext';

const mockBack = jest.fn();
const mockStore = new Map<string, string>();

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

const wrap = () =>
  render(
    <ThemeProvider>
      <LanguageScreen />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
});

afterEach(async () => {
  // The suite shares one i18n instance; return it to English.
  await i18n.changeLanguage('en');
});

test('lists the three language options with the current selection', async () => {
  mockStore.set('app-language', 'en');
  wrap();

  expect(screen.getByText('Language')).toBeTruthy();
  expect(screen.getByText('System Default')).toBeTruthy();
  expect(screen.getByText('English')).toBeTruthy();
  expect(screen.getByText('简体中文')).toBeTruthy();

  await waitFor(() =>
    expect(
      screen.getByTestId('language-en').props.accessibilityState.selected,
    ).toBe(true),
  );
});

test('selecting Chinese persists the override and re-renders translated', async () => {
  wrap();

  fireEvent.press(screen.getByText('简体中文'));

  await waitFor(() => expect(mockStore.get('app-language')).toBe('zh-Hans'));
  expect(i18n.language).toBe('zh-Hans');
  await waitFor(() => expect(screen.getByText('语言')).toBeTruthy());
});

test('selecting system falls back to the device language', async () => {
  await setAppLanguage('zh-Hans');
  wrap();

  fireEvent.press(screen.getByText('跟随系统'));

  await waitFor(() => expect(mockStore.get('app-language')).toBe('system'));
  expect(i18n.language).toBe('en');
});
