import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ConnectAccountScreen from '@/app/(tabs)/(settings)/connect';
import { CloudflareApiError } from '../cloudflare/api';
import { ConnectStep } from '../onboarding/ConnectStep';
import {
  addConnection,
  addOauthConnection,
} from '../cloudflare/connections';
import {
  authorize,
  exchangeAuthorizationCode,
  fetchOauthIdentity,
  getOauthConfig,
} from '../cloudflare/oauth';
import { ThemeProvider } from '../theme/ThemeContext';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>();

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
  }),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
  useAuthRequest: () => [{ codeVerifier: 'verifier' }, null, jest.fn()],
}));

jest.mock('../cloudflare/oauth', () => ({
  discovery: {},
  appCallbackUrl: 'cfops://oauth/callback',
  authorize: jest.fn(),
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
  mockCanGoBack.mockReturnValue(true);
  jest.mocked(getOauthConfig).mockReturnValue({
    clientId: 'client-1',
    redirectUri: 'https://cf.example.com/oauth/callback',
    scopes: ['zone.read', 'offline_access'],
  });
  jest.mocked(authorize).mockResolvedValue({
    type: 'success',
    params: { code: 'the-code' },
  } as unknown as Awaited<ReturnType<typeof authorize>>);
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
});

describe('OAuth sign-in', () => {
  test('falls back to an explicit route when the history is gone', async () => {
    // The auth sheet can outlive the screen. Staying put would read as a silent
    // failure even though the credential was stored.
    mockCanGoBack.mockReturnValue(false);
    wrap();

    fireEvent.press(screen.getByTestId('oauth-signin'));

    await waitFor(() => expect(addOauthConnection).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(settings)'),
    );
    expect(mockBack).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByTestId('oauth-signin').props.accessibilityState.disabled,
      ).toBe(false),
    );
  });

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
    jest.mocked(authorize).mockResolvedValue({ type: 'cancel' });
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

  test('releases the busy state so the screen cannot wedge', async () => {
    // The screen may outlive the request — a stuck spinner with no error and no
    // way out is worse than one frame of re-enabled buttons.
    wrap();

    fireEvent.changeText(screen.getByTestId('api-token'), 'secret');
    fireEvent.press(screen.getByTestId('connect-submit'));

    await waitFor(() => expect(addConnection).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByTestId('oauth-signin').props.accessibilityState.disabled,
      ).toBe(false),
    );
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

describe('Onboarding connect step', () => {
  const wrapStep = () => {
    const onAdvance = jest.fn<Promise<void>, []>().mockResolvedValue();
    render(
      <ThemeProvider>
        <ConnectStep onAdvance={onAdvance} onBack={jest.fn()} />
      </ThemeProvider>,
    );
    return onAdvance;
  };

  test('binds an API token and advances to the final step', async () => {
    const onAdvance = wrapStep();

    expect(screen.queryByTestId('token-panel')).toBeNull();
    fireEvent.press(screen.getByLabelText('Use an API token'));

    fireEvent.changeText(screen.getByTestId('api-token'), 'secret');
    fireEvent.press(screen.getByTestId('connect-submit'));

    await waitFor(() => expect(onAdvance).toHaveBeenCalled());
    expect(addConnection).toHaveBeenCalledWith('secret');
  });

  test('completes the OAuth flow and advances', async () => {
    const onAdvance = wrapStep();

    fireEvent.press(screen.getByLabelText('Authorize with Cloudflare'));

    await waitFor(() => expect(onAdvance).toHaveBeenCalled());
    expect(addOauthConnection).toHaveBeenCalled();
  });

  test('disables the OAuth choice with a hint when unconfigured', () => {
    jest.mocked(getOauthConfig).mockReturnValue(null);
    wrapStep();

    expect(
      screen.getByLabelText('Authorize with Cloudflare').props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByText(/Register an OAuth client in the Cloudflare dashboard/),
    ).toBeTruthy();
  });

  test('keeps the step in place when the token is rejected', async () => {
    jest
      .mocked(addConnection)
      .mockRejectedValue(new CloudflareApiError('invalid-token'));
    const onAdvance = wrapStep();

    fireEvent.press(screen.getByLabelText('Use an API token'));
    fireEvent.changeText(screen.getByTestId('api-token'), 'bad');
    fireEvent.press(screen.getByTestId('connect-submit'));

    await waitFor(() =>
      expect(
        screen.getByText('The API token is invalid or expired.'),
      ).toBeTruthy(),
    );
    expect(onAdvance).not.toHaveBeenCalled();
  });

  test('skipping advances without binding a credential', async () => {
    const onAdvance = wrapStep();

    fireEvent.press(screen.getByText('Skip for now'));

    await waitFor(() => expect(onAdvance).toHaveBeenCalled());
    expect(addConnection).not.toHaveBeenCalled();
    expect(addOauthConnection).not.toHaveBeenCalled();
  });
});
