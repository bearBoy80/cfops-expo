jest.mock('../connections', () => ({
  getConnectionOauthTokens: jest.fn(),
  updateConnectionOauthTokens: jest.fn(),
}));

jest.mock('../oauth', () => ({
  refreshOauthTokens: jest.fn(),
}));

import {
  getConnectionOauthTokens,
  updateConnectionOauthTokens,
} from '../connections';
import { refreshOauthTokens } from '../oauth';
import { getOauthAccessToken, resetOauthSessions } from '../oauthSession';

const HOUR = 3_600_000;

const stored = (overrides: Record<string, unknown> = {}) => ({
  accessToken: 'stale-access',
  refreshToken: 'the-refresh',
  expiresAt: Date.now() + HOUR,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetOauthSessions();
  jest.mocked(updateConnectionOauthTokens).mockResolvedValue();
  jest.mocked(refreshOauthTokens).mockResolvedValue({
    accessToken: 'fresh-access',
    refreshToken: 'rotated-refresh',
    expiresAt: Date.now() + HOUR,
  });
});

test('returns null when the connection has no stored grant', async () => {
  jest.mocked(getConnectionOauthTokens).mockResolvedValue(null);

  await expect(getOauthAccessToken('oauth-1')).resolves.toBeNull();
  expect(refreshOauthTokens).not.toHaveBeenCalled();
});

test('uses the stored token while it is still valid', async () => {
  jest.mocked(getConnectionOauthTokens).mockResolvedValue(stored());

  await expect(getOauthAccessToken('oauth-1')).resolves.toBe('stale-access');
  expect(refreshOauthTokens).not.toHaveBeenCalled();
});

test('renews shortly before the token actually expires', async () => {
  // Inside the safety margin: still valid, but not for long enough to make a
  // request with, so it must be renewed rather than handed out.
  jest
    .mocked(getConnectionOauthTokens)
    .mockResolvedValue(stored({ expiresAt: Date.now() + 5_000 }));

  await expect(getOauthAccessToken('oauth-1')).resolves.toBe('fresh-access');
  expect(refreshOauthTokens).toHaveBeenCalledWith('the-refresh');
});

test('renews an expired token and persists the rotated grant', async () => {
  jest
    .mocked(getConnectionOauthTokens)
    .mockResolvedValue(stored({ expiresAt: Date.now() - HOUR }));

  await expect(getOauthAccessToken('oauth-1')).resolves.toBe('fresh-access');
  expect(updateConnectionOauthTokens).toHaveBeenCalledWith('oauth-1', {
    accessToken: 'fresh-access',
    refreshToken: 'rotated-refresh',
    expiresAt: expect.any(Number),
    scope: undefined,
  });
});

test('keeps the previous refresh token and scope when the server omits them', async () => {
  jest.mocked(getConnectionOauthTokens).mockResolvedValue(
    stored({ expiresAt: Date.now() - HOUR, scope: 'zone.read offline_access' }),
  );
  jest.mocked(refreshOauthTokens).mockResolvedValue({
    accessToken: 'fresh-access',
    expiresAt: Date.now() + HOUR,
  });

  await getOauthAccessToken('oauth-1');

  expect(updateConnectionOauthTokens).toHaveBeenCalledWith(
    'oauth-1',
    expect.objectContaining({
      refreshToken: 'the-refresh',
      // A refresh can never widen the grant, so the old value still holds.
      scope: 'zone.read offline_access',
    }),
  );
});

describe('when the keychain write fails', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .mocked(getConnectionOauthTokens)
      .mockResolvedValue(stored({ expiresAt: Date.now() - HOUR }));
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test('still hands out the renewed access token', async () => {
    jest
      .mocked(updateConnectionOauthTokens)
      .mockRejectedValue(new Error('keychain busy'));

    // The exchange has already spent the stored refresh token, so throwing
    // here would ask for a reconnect right after a successful renewal.
    await expect(getOauthAccessToken('oauth-1')).resolves.toBe('fresh-access');
  });

  test('renews from the rotated token rather than the dead stored one', async () => {
    jest
      .mocked(updateConnectionOauthTokens)
      .mockRejectedValueOnce(new Error('keychain busy'));
    // Every grant here is born expired, so the second call has to renew again
    // and reveals which refresh token it reached for.
    jest.mocked(refreshOauthTokens).mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'rotated-refresh',
      expiresAt: Date.now() - 1,
    });

    await getOauthAccessToken('oauth-1');
    await getOauthAccessToken('oauth-1');

    expect(refreshOauthTokens).toHaveBeenNthCalledWith(2, 'rotated-refresh');
    // And the write is retried instead of abandoned.
    expect(updateConnectionOauthTokens).toHaveBeenCalledTimes(2);
  });

  test('yields to a grant that later reaches the keychain', async () => {
    jest
      .mocked(updateConnectionOauthTokens)
      .mockRejectedValueOnce(new Error('keychain busy'));

    await getOauthAccessToken('oauth-1');

    // Reconnecting the account stores a new grant under the same id, and the
    // copy kept in memory must not shadow it.
    jest
      .mocked(getConnectionOauthTokens)
      .mockResolvedValue(stored({ accessToken: 'reconnected-access' }));

    await expect(getOauthAccessToken('oauth-1')).resolves.toBe(
      'reconnected-access',
    );
    expect(refreshOauthTokens).toHaveBeenCalledTimes(1);
  });
});

test('shares one renewal across concurrent callers', async () => {
  jest
    .mocked(getConnectionOauthTokens)
    .mockResolvedValue(stored({ expiresAt: Date.now() - HOUR }));

  // Screens fan out with Promise.all; a rotated refresh token means every
  // extra exchange would invalidate the others.
  const tokens = await Promise.all([
    getOauthAccessToken('oauth-1'),
    getOauthAccessToken('oauth-1'),
    getOauthAccessToken('oauth-1'),
  ]);

  expect(tokens).toEqual(['fresh-access', 'fresh-access', 'fresh-access']);
  expect(refreshOauthTokens).toHaveBeenCalledTimes(1);
});

test('renews each connection independently', async () => {
  jest
    .mocked(getConnectionOauthTokens)
    .mockResolvedValue(stored({ expiresAt: Date.now() - HOUR }));

  await Promise.all([
    getOauthAccessToken('oauth-1'),
    getOauthAccessToken('oauth-2'),
  ]);

  expect(refreshOauthTokens).toHaveBeenCalledTimes(2);
});

test('renews again after an earlier renewal settled', async () => {
  jest
    .mocked(getConnectionOauthTokens)
    .mockResolvedValue(stored({ expiresAt: Date.now() - HOUR }));

  await getOauthAccessToken('oauth-1');
  await getOauthAccessToken('oauth-1');

  // The in-flight entry must be released, otherwise the second call would
  // reuse a resolved promise forever.
  expect(refreshOauthTokens).toHaveBeenCalledTimes(2);
});

test('reports an expired session when offline_access was never granted', async () => {
  jest.mocked(getConnectionOauthTokens).mockResolvedValue(
    stored({ expiresAt: Date.now() - HOUR, refreshToken: undefined }),
  );

  await expect(getOauthAccessToken('oauth-1')).rejects.toMatchObject({
    code: 'session-expired',
  });
  expect(refreshOauthTokens).not.toHaveBeenCalled();
});

test('propagates a rejected renewal and frees the slot', async () => {
  jest
    .mocked(getConnectionOauthTokens)
    .mockResolvedValue(stored({ expiresAt: Date.now() - HOUR }));
  jest
    .mocked(refreshOauthTokens)
    .mockRejectedValueOnce(Object.assign(new Error('nope'), {
      code: 'session-expired',
    }));

  await expect(getOauthAccessToken('oauth-1')).rejects.toThrow('nope');

  // A failed renewal must not wedge the connection: a later attempt retries.
  jest.mocked(refreshOauthTokens).mockResolvedValue({
    accessToken: 'fresh-access',
    refreshToken: 'rotated-refresh',
    expiresAt: Date.now() + HOUR,
  });
  await expect(getOauthAccessToken('oauth-1')).resolves.toBe('fresh-access');
});

test('leaves a token without a recorded expiry untouched', async () => {
  jest
    .mocked(getConnectionOauthTokens)
    .mockResolvedValue(stored({ expiresAt: undefined }));

  await expect(getOauthAccessToken('oauth-1')).resolves.toBe('stale-access');
  expect(refreshOauthTokens).not.toHaveBeenCalled();
});
