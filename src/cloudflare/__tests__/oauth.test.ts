const mockExpoConfig: { extra?: Record<string, unknown> } = {};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));

jest.mock('expo-auth-session', () => ({
  exchangeCodeAsync: jest.fn(),
  refreshAsync: jest.fn(),
  makeRedirectUri: jest.fn(() => 'cfops://oauth/callback'),
  // Stands in for the real error the token helpers throw when the endpoint
  // answers with an OAuth error body instead of tokens.
  TokenError: class TokenError extends Error {
    params: Record<string, string>;

    constructor(params: Record<string, string>) {
      super(params.error_description ?? params.error);
      this.params = params;
    }
  },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

import type { AuthRequest, AuthSessionResult } from 'expo-auth-session';
import { exchangeCodeAsync, refreshAsync, TokenError } from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import {
  appCallbackUrl,
  authorize,
  exchangeAuthorizationCode,
  fetchOauthIdentity,
  getOauthConfig,
  refreshOauthTokens,
} from '../oauth';

const mockFetch = jest.fn();
const RELAY = 'https://cf.example.com/oauth/callback';

/** A fully configured client: both the id and the relay URL are required. */
const configure = (overrides: Record<string, unknown> = {}) => {
  mockExpoConfig.extra = {
    cloudflareOauth: { clientId: 'abc', redirectUri: RELAY, ...overrides },
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  delete mockExpoConfig.extra;
  (globalThis as { fetch: unknown }).fetch = mockFetch;
});

describe('getOauthConfig', () => {
  test('returns null when no client id is configured', () => {
    mockExpoConfig.extra = {
      cloudflareOauth: { clientId: '', redirectUri: RELAY },
    };
    expect(getOauthConfig()).toBeNull();
  });

  test('returns null until the callback relay is configured', () => {
    // Cloudflare rejects private-use schemes, so there is no usable default.
    mockExpoConfig.extra = { cloudflareOauth: { clientId: 'abc' } };
    expect(getOauthConfig()).toBeNull();

    mockExpoConfig.extra = {
      cloudflareOauth: { clientId: 'abc', redirectUri: '  ' },
    };
    expect(getOauthConfig()).toBeNull();
  });

  test('falls back to the scopes the app screens need', () => {
    configure({ clientId: ' abc ' });
    const config = getOauthConfig();

    expect(config?.clientId).toBe('abc');
    expect(config?.redirectUri).toBe(RELAY);
    // Scope ids differ from the API-token permission names.
    expect(config?.scopes).toEqual(
      expect.arrayContaining([
        'account-settings.read',
        'zone.read',
        'dns.read',
        'workers-scripts.read',
        'workers-kv-storage.read',
        'workers-r2.read',
        'd1.read',
        'page.read',
        'analytics.read',
      ]),
    );
    expect(config?.scopes).not.toContain('account.read');
    expect(config?.scopes).not.toContain('workers.read');
  });

  test('always requests offline_access so a refresh token is issued', () => {
    configure();
    expect(getOauthConfig()?.scopes).toContain('offline_access');

    configure({ scopes: ['zone.read'] });
    expect(getOauthConfig()?.scopes).toEqual(['zone.read', 'offline_access']);

    // Never duplicated when the override already asks for it.
    configure({ scopes: ['zone.read', 'offline_access'] });
    expect(getOauthConfig()?.scopes).toEqual(['zone.read', 'offline_access']);
  });
});

describe('appCallbackUrl', () => {
  test('is a fixed url the relay can be pointed at', () => {
    // Never derived from makeRedirectUri: that splices the Metro host into a
    // development build and switches to exp:// under Expo Go, so the scheme
    // ASWebAuthenticationSession listens on would stop matching the relay.
    expect(appCallbackUrl).toBe('cfops://oauth/callback');
    expect(appCallbackUrl).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(appCallbackUrl.startsWith('cfops://')).toBe(true);
  });
});

describe('authorize', () => {
  const authRequest = {
    makeAuthUrlAsync: jest.fn(),
    parseReturnUrl: jest.fn(),
  };

  beforeEach(() => {
    authRequest.makeAuthUrlAsync.mockResolvedValue(
      `https://dash.cloudflare.com/oauth2/auth?redirect_uri=${encodeURIComponent(RELAY)}`,
    );
    authRequest.parseReturnUrl.mockReturnValue({
      type: 'success',
      params: { code: 'the-code' },
    });
  });

  test('sends the relay url but listens on the app scheme', async () => {
    jest.mocked(openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: 'cfops://oauth/callback?code=the-code&state=s',
    });

    const result = await authorize(authRequest as unknown as AuthRequest);

    const [startUrl, returnUrl] = jest.mocked(openAuthSessionAsync).mock
      .calls[0]!;
    expect(startUrl).toContain(encodeURIComponent(RELAY));
    expect(returnUrl).toBe(appCallbackUrl);
    expect(returnUrl).toBe('cfops://oauth/callback');

    // The state check still runs, on the url the relay bounced back.
    expect(authRequest.parseReturnUrl).toHaveBeenCalledWith(
      'cfops://oauth/callback?code=the-code&state=s',
    );
    expect(result).toEqual({ type: 'success', params: { code: 'the-code' } });
  });

  test('passes a dismissed browser session through untouched', async () => {
    jest
      .mocked(openAuthSessionAsync)
      .mockResolvedValue({ type: 'dismiss' } as Awaited<
        ReturnType<typeof openAuthSessionAsync>
      >);

    await expect(
      authorize(authRequest as unknown as AuthRequest),
    ).resolves.toEqual({ type: 'dismiss' });
    expect(authRequest.parseReturnUrl).not.toHaveBeenCalled();
  });
});

describe('exchangeAuthorizationCode', () => {
  const request = { codeVerifier: 'verifier' } as AuthRequest;

  test('rejects cancelled authorizations', async () => {
    await expect(
      exchangeAuthorizationCode(request, {
        type: 'cancel',
      } as AuthSessionResult),
    ).rejects.toThrow('Authorization was cancelled.');
  });

  test('exchanges the code with the PKCE verifier', async () => {
    configure();
    jest.mocked(exchangeCodeAsync).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 3600,
      issuedAt: 1_700_000_000,
    } as Awaited<ReturnType<typeof exchangeCodeAsync>>);

    const tokens = await exchangeAuthorizationCode(request, {
      type: 'success',
      params: { code: 'the-code' },
    } as unknown as AuthSessionResult);

    expect(tokens).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: (1_700_000_000 + 3600) * 1000,
    });
    expect(exchangeCodeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'abc',
        code: 'the-code',
        // The relay url, not the app scheme: it must match the auth request.
        redirectUri: RELAY,
        extraParams: { code_verifier: 'verifier' },
      }),
      expect.objectContaining({
        tokenEndpoint: 'https://dash.cloudflare.com/oauth2/token',
      }),
    );
  });

  const success = {
    type: 'success',
    params: { code: 'the-code' },
  } as unknown as AuthSessionResult;

  test('reports a rejected exchange as an authorization failure', async () => {
    configure();
    jest.mocked(exchangeCodeAsync).mockRejectedValue(
      new TokenError({
        error: 'invalid_grant',
        error_description: 'The authorization code has expired.',
      }),
    );

    // Cloudflare answered. Calling that a connectivity problem hides the only
    // thing the user can act on, which is to authorize again.
    await expect(
      exchangeAuthorizationCode(request, success),
    ).rejects.toMatchObject({
      code: 'oauth-failed',
      message: 'The authorization code has expired.',
    });
  });

  test('reports an unreachable token endpoint as a network failure', async () => {
    configure();
    jest
      .mocked(exchangeCodeAsync)
      .mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      exchangeAuthorizationCode(request, success),
    ).rejects.toMatchObject({ code: 'network' });
  });
});

describe('refreshOauthTokens', () => {
  test('reports a revoked grant as an expired session', async () => {
    configure();
    jest
      .mocked(refreshAsync)
      .mockRejectedValue(new TokenError({ error: 'invalid_grant' }));

    await expect(refreshOauthTokens('revoked')).rejects.toMatchObject({
      code: 'session-expired',
    });
  });

  test('keeps a grant that merely failed to reach Cloudflare', async () => {
    configure();
    jest
      .mocked(refreshAsync)
      .mockRejectedValue(new TypeError('Network request failed'));

    // `session-expired` reads as "sign in again", which is the wrong advice for
    // a refresh token that is still perfectly good.
    await expect(refreshOauthTokens('the-refresh')).rejects.toMatchObject({
      code: 'network',
    });
  });
});

describe('fetchOauthIdentity', () => {
  test('returns the subject and email', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ sub: 'user-1', email: 'sarah@acme.com' }),
    });

    await expect(fetchOauthIdentity('access')).resolves.toEqual({
      sub: 'user-1',
      email: 'sarah@acme.com',
    });
  });

  test('maps 401 responses to invalid-token', async () => {
    mockFetch.mockResolvedValue({ status: 401, json: async () => ({}) });

    await expect(fetchOauthIdentity('stale')).rejects.toMatchObject({
      code: 'invalid-token',
    });
  });
});
