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
}));

import type { AuthRequest, AuthSessionResult } from 'expo-auth-session';
import { exchangeCodeAsync } from 'expo-auth-session';
import {
  exchangeAuthorizationCode,
  fetchOauthIdentity,
  getOauthConfig,
  redirectUri,
} from '../oauth';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  delete mockExpoConfig.extra;
  (globalThis as { fetch: unknown }).fetch = mockFetch;
});

describe('getOauthConfig', () => {
  test('returns null when no client id is configured', () => {
    mockExpoConfig.extra = { cloudflareOauth: { clientId: '' } };
    expect(getOauthConfig()).toBeNull();
  });

  test('returns the client id with default scopes', () => {
    mockExpoConfig.extra = { cloudflareOauth: { clientId: ' abc ' } };
    expect(getOauthConfig()).toEqual({
      clientId: 'abc',
      scopes: [
        'account.read',
        'workers.read',
        'workers_kv.read',
        'workers_r2.read',
        'd1.read',
        'pages.read',
        'offline_access',
      ],
    });
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
    mockExpoConfig.extra = { cloudflareOauth: { clientId: 'abc' } };
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
        redirectUri,
        extraParams: { code_verifier: 'verifier' },
      }),
      expect.objectContaining({
        tokenEndpoint: 'https://dash.cloudflare.com/oauth2/token',
      }),
    );
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
