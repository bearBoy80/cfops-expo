import {
  CloudflareApiError,
  getZoneSslMode,
  listAccounts,
  listZones,
  verifyToken,
} from '../api';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as { fetch: unknown }).fetch = mockFetch;
});

const jsonResponse = (body: unknown, status = 200) => ({
  status,
  json: async () => body,
});

describe('verifyToken', () => {
  test('returns the token id for an active token', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        result: { id: 'tok-1', status: 'active' },
      }),
    );

    await expect(verifyToken('  secret  ')).resolves.toEqual({
      id: 'tok-1',
      status: 'active',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/user/tokens/verify',
    );
    expect(init.headers.Authorization).toBe('Bearer secret');
  });

  test('rejects tokens that are not active', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        result: { id: 'tok-1', status: 'disabled' },
      }),
    );

    await expect(verifyToken('secret')).rejects.toMatchObject({
      code: 'invalid-token',
    });
  });

  test('maps 401 responses to invalid-token', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));

    await expect(verifyToken('bad')).rejects.toMatchObject({
      code: 'invalid-token',
    });
  });

  test('maps fetch failures to network errors', async () => {
    mockFetch.mockRejectedValue(new TypeError('offline'));

    await expect(verifyToken('secret')).rejects.toMatchObject({
      code: 'network',
    });
  });

  test('surfaces Cloudflare error messages', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: false,
        errors: [{ code: 9109, message: 'Invalid access token' }],
        result: null,
      }),
    );

    await expect(verifyToken('secret')).rejects.toThrow(
      'Invalid access token',
    );
  });
});

describe('listAccounts', () => {
  test('returns id/name pairs', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        result: [
          { id: 'acc-1', name: 'Acme Corp', type: 'standard' },
          { id: 'acc-2', name: 'Side Project', type: 'standard' },
        ],
      }),
    );

    await expect(listAccounts('secret')).resolves.toEqual([
      { id: 'acc-1', name: 'Acme Corp' },
      { id: 'acc-2', name: 'Side Project' },
    ]);
  });

  test('propagates CloudflareApiError instances', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    });

    await expect(listAccounts('secret')).rejects.toBeInstanceOf(
      CloudflareApiError,
    );
  });
});

describe('listZones', () => {
  test('maps the zone payload to a flat shape', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        result: [
          {
            id: 'zone-1',
            name: 'acme.com',
            status: 'active',
            paused: false,
            plan: { name: 'Enterprise' },
            account: { id: 'acc-1', name: 'Acme Corp' },
            name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
          },
          {
            id: 'zone-2',
            name: 'bare.dev',
            status: 'pending',
          },
        ],
      }),
    );

    await expect(listZones('secret')).resolves.toEqual([
      {
        id: 'zone-1',
        name: 'acme.com',
        status: 'active',
        paused: false,
        plan: 'Enterprise',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        nameServers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
      },
      {
        id: 'zone-2',
        name: 'bare.dev',
        status: 'pending',
        paused: false,
        plan: 'Free',
        accountId: '',
        accountName: '',
        nameServers: [],
      },
    ]);
  });
});

describe('getZoneSslMode', () => {
  test('returns the ssl setting value', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        result: { id: 'ssl', value: 'strict' },
      }),
    );

    await expect(getZoneSslMode('secret', 'zone-1')).resolves.toBe('strict');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/zones/zone-1/settings/ssl',
    );
  });
});
