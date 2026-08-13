jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listZones: jest.fn(),
}));

jest.mock('../connections', () => ({
  listConnections: jest.fn(),
  getConnectionToken: jest.fn(),
  getConnectionOauthTokens: jest.fn(),
}));

import { CloudflareApiError, listZones, type CfZone } from '../api';
import {
  getConnectionOauthTokens,
  getConnectionToken,
  listConnections,
  type CloudflareConnection,
} from '../connections';
import {
  fetchZonesSnapshot,
  getConnectionBearer,
  invalidateZonesSnapshot,
} from '../resources';

const tokenConnection: CloudflareConnection = {
  id: 'tok-1',
  label: 'Ops token',
  authType: 'token',
  accounts: [{ id: 'acc-1', name: 'Acme Corp' }],
  createdAt: 1,
};

const oauthConnection: CloudflareConnection = {
  id: 'oauth-user-1',
  label: 'sarah@acme.com',
  authType: 'oauth',
  accounts: [{ id: 'acc-2', name: 'Side Project' }],
  createdAt: 2,
};

const zone = (overrides: Partial<CfZone>): CfZone => ({
  id: 'zone-1',
  name: 'acme.com',
  status: 'active',
  paused: false,
  plan: 'Pro',
  accountId: 'acc-1',
  accountName: 'Acme Corp',
  nameServers: [],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  invalidateZonesSnapshot();
  jest.mocked(listConnections).mockResolvedValue([tokenConnection]);
  jest.mocked(getConnectionToken).mockResolvedValue('secret');
  jest.mocked(getConnectionOauthTokens).mockResolvedValue({
    accessToken: 'oauth-access',
  });
  jest.mocked(listZones).mockResolvedValue([zone({})]);
});

describe('getConnectionBearer', () => {
  test('uses the raw API token for token connections', async () => {
    await expect(getConnectionBearer(tokenConnection)).resolves.toBe(
      'secret',
    );
  });

  test('uses the stored access token for oauth connections', async () => {
    await expect(getConnectionBearer(oauthConnection)).resolves.toBe(
      'oauth-access',
    );
  });
});

describe('fetchZonesSnapshot', () => {
  test('aggregates zones and accounts across connections', async () => {
    jest
      .mocked(listConnections)
      .mockResolvedValue([tokenConnection, oauthConnection]);
    jest
      .mocked(listZones)
      .mockResolvedValueOnce([zone({})])
      .mockResolvedValueOnce([
        zone({
          id: 'zone-2',
          name: 'side.dev',
          accountId: 'acc-2',
          accountName: 'Side Project',
        }),
      ]);

    const snapshot = await fetchZonesSnapshot({ force: true });

    expect(snapshot.connectionCount).toBe(2);
    expect(snapshot.zones.map((item) => item.name)).toEqual([
      'acme.com',
      'side.dev',
    ]);
    expect(snapshot.accounts).toEqual([
      { id: 'acc-1', name: 'Acme Corp', zoneCount: 1 },
      { id: 'acc-2', name: 'Side Project', zoneCount: 1 },
    ]);
    expect(snapshot.issues).toEqual([]);
  });

  test('dedupes zones visible through several credentials', async () => {
    jest
      .mocked(listConnections)
      .mockResolvedValue([tokenConnection, oauthConnection]);
    jest.mocked(listZones).mockResolvedValue([zone({})]);

    const snapshot = await fetchZonesSnapshot({ force: true });

    expect(snapshot.zones).toHaveLength(1);
    expect(snapshot.accounts.find((a) => a.id === 'acc-1')?.zoneCount).toBe(1);
  });

  test('captures per-connection failures without dropping the rest', async () => {
    jest
      .mocked(listConnections)
      .mockResolvedValue([tokenConnection, oauthConnection]);
    jest
      .mocked(listZones)
      .mockImplementation(async (bearer: string) => {
        if (bearer === 'oauth-access') {
          throw new CloudflareApiError('invalid-token');
        }
        return [zone({})];
      });

    const snapshot = await fetchZonesSnapshot({ force: true });

    expect(snapshot.zones).toHaveLength(1);
    expect(snapshot.issues).toEqual([
      {
        connectionId: 'oauth-user-1',
        label: 'sarah@acme.com',
        cause: expect.objectContaining({ code: 'invalid-token' }),
      },
    ]);
  });

  test('reuses the cached snapshot within the TTL', async () => {
    await fetchZonesSnapshot({ force: true });
    await fetchZonesSnapshot();

    expect(listZones).toHaveBeenCalledTimes(1);
  });

  test('force bypasses the cache', async () => {
    await fetchZonesSnapshot({ force: true });
    await fetchZonesSnapshot({ force: true });

    expect(listZones).toHaveBeenCalledTimes(2);
  });
});
