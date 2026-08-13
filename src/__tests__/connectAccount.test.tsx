import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ConnectAccountScreen from '../../app/(tabs)/(settings)/connect';
import { CloudflareApiError } from '../cloudflare/api';
import {
  addConnection,
  addOauthConnection,
} from '../cloudflare/connections';
import {
  exchangeAuthorizationCode,
  fetchOauthIdentity,
  getOauthConfig,
} from '../cloudflare/oauth';
import { ThemeProvider } from '../theme/ThemeContext';

const mockBack = jest.fn();
const mockPromptAsync = jest.fn();

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

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
  useAuthRequest: () => [
    { codeVerifier: 'verifier' },
    null,
    mockPromptAsync,
  ],
}));

jest.mock('../cloudflare/oauth', () => ({
  discovery: {},
  redirectUri: 'cfops://oauth/callback',
  getOauthConfig: jest.fn(),
  exchangeAuthorizationCode: jest.fn(),
  fetchOauthIdentity: jest.fn(),
}));

jest.mock('../cloudflare/connections', () => ({
  addConnection: jest.fn(),
  addOauthConnection: jest.fn(),
}));

const connection = {
  id: 'tok-1',
  label: 'Acme Corp',
  authType: 'token' as const,
  accounts: [{ id: 'acc-1', name: 'Acme Corp' }],
  createdAt: 1700000000000,
};

const wrap = () =>
  render(
    <ThemeProvider>
      <ConnectAccountScreen />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getOauthConfig).mockReturnValue({
    clientId: 'client-1',
    scopes: ['account.read', 'offline_access'],
  });
  jest.mocked(addConnection).mockResolvedValue(connection);
  jest.mocked(addOauthConnection).mockResolvedValue({
    ...connection,
    id: 'oauth-user-1',
    authType: 'oauth',
  });
  jest.mocked(exchangeAuthorizationCode).mockResolvedValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: 1700003600000,
  });
  jest.mocked(fetchOauthIdentity).mockResolvedValue({
    sub: 'user-1',
    email: 'sarah@acme.com',
  });
  mockPromptAsync.mockResolvedValue({
    type: 'success',
    params: { code: 'the-code' },
  });
});

describe('OAuth sign-in', () => {
  test('completes the flow and navigates back', async () => {
    wrap();

    fireEvent.press(screen.getByTestId('oauth-signin'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(addOauthConnection).toHaveBeenCalledWith(
      {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1700003600000,
      },
      { sub: 'user-1', email: 'sarah@acme.com' },
    );
  });

  test('stays quiet when the user cancels the browser flow', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'cancel' });
    wrap();

    fireEvent.press(screen.getByTestId('oauth-signin'));

    await waitFor(() =>
      expect(
        screen.getByTestId('oauth-signin').props.accessibilityState.disabled,
      ).toBe(false),
    );
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('shows an error when the exchange fails', async () => {
    jest
      .mocked(exchangeAuthorizationCode)
      .mockRejectedValue(new CloudflareApiError('network'));
    wrap();

    fireEvent.press(screen.getByTestId('oauth-signin'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Could not reach Cloudflare. Check your connection.',
        ),
      ).toBeTruthy(),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('is disabled with a hint when no client is configured', () => {
    jest.mocked(getOauthConfig).mockReturnValue(null);
    wrap();

    expect(
      screen.getByTestId('oauth-signin').props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByText(/Register an OAuth client in the Cloudflare dashboard/),
    ).toBeTruthy();
  });
});

describe('API token fallback', () => {
  test('keeps the submit button disabled until a token is entered', () => {
    wrap();

    expect(
      screen.getByTestId('connect-submit').props.accessibilityState.disabled,
    ).toBe(true);

    fireEvent.changeText(screen.getByTestId('api-token'), 'secret');

    expect(
      screen.getByTestId('connect-submit').props.accessibilityState.disabled,
    ).toBe(false);
  });

  test('connects and navigates back on success', async () => {
    wrap();

    fireEvent.changeText(screen.getByTestId('api-token'), 'secret');
    fireEvent.press(screen.getByTestId('connect-submit'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(addConnection).toHaveBeenCalledWith('secret');
  });

  test('shows the API error message when verification fails', async () => {
    jest
      .mocked(addConnection)
      .mockRejectedValue(new CloudflareApiError('invalid-token'));
    wrap();

    fireEvent.changeText(screen.getByTestId('api-token'), 'bad');
    fireEvent.press(screen.getByTestId('connect-submit'));

    await waitFor(() =>
      expect(
        screen.getByText('The API token is invalid or expired.'),
      ).toBeTruthy(),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('clears the error once the token is edited', async () => {
    jest
      .mocked(addConnection)
      .mockRejectedValue(new CloudflareApiError('network'));
    wrap();

    fireEvent.changeText(screen.getByTestId('api-token'), 'bad');
    fireEvent.press(screen.getByTestId('connect-submit'));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Could not reach Cloudflare. Check your connection.',
        ),
      ).toBeTruthy(),
    );

    fireEvent.changeText(screen.getByTestId('api-token'), 'bad2');

    expect(
      screen.queryByText(
        'Could not reach Cloudflare. Check your connection.',
      ),
    ).toBeNull();
  });
});
