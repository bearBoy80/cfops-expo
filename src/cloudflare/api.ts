const API_BASE = 'https://api.cloudflare.com/client/v4';

export type CloudflareApiErrorCode =
  | 'invalid-token'
  | 'network'
  | 'api'
  | 'oauth-cancelled'
  | 'oauth-failed'
  | 'oauth-config'
  | 'session-expired'
  | 'identity'
  | 'missing-credential';

const defaultMessages: Record<CloudflareApiErrorCode, string> = {
  'invalid-token': 'The API token is invalid or expired.',
  network: 'Could not reach Cloudflare. Check your connection.',
  api: 'Cloudflare returned an unexpected response.',
  'oauth-cancelled': 'Authorization was cancelled.',
  'oauth-failed': 'Authorization failed.',
  'oauth-config': 'OAuth client is not configured.',
  'session-expired': 'The session has expired.',
  identity: 'Could not read the Cloudflare user identity.',
  'missing-credential': 'The stored credential is missing.',
};

export class CloudflareApiError extends Error {
  readonly code: CloudflareApiErrorCode;
  /**
   * Message returned by the Cloudflare API itself (already user-facing).
   * When absent, the UI translates the `code` instead.
   */
  readonly serverMessage?: string;

  constructor(code: CloudflareApiErrorCode, serverMessage?: string) {
    super(serverMessage ?? defaultMessages[code]);
    this.name = 'CloudflareApiError';
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

export interface TokenVerification {
  /** Cloudflare-assigned id of the token itself. */
  id: string;
  status: string;
}

export interface CfAccountRef {
  id: string;
  name: string;
}

interface CfEnvelope<T> {
  success: boolean;
  errors?: { code?: number; message?: string }[];
  result: T;
  result_info?: { total_count?: number };
}

interface RequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function requestEnvelope<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<CfEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new CloudflareApiError('network');
  }

  if (response.status === 401 || response.status === 403) {
    throw new CloudflareApiError('invalid-token');
  }

  let envelope: CfEnvelope<T>;
  try {
    envelope = (await response.json()) as CfEnvelope<T>;
  } catch {
    throw new CloudflareApiError('api');
  }

  if (!envelope.success) {
    const message = envelope.errors?.[0]?.message;
    throw new CloudflareApiError('api', message);
  }

  return envelope;
}

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  return (await requestEnvelope<T>(path, token, init)).result;
}

export async function verifyToken(token: string): Promise<TokenVerification> {
  const result = await request<TokenVerification>(
    '/user/tokens/verify',
    token,
  );
  if (result.status !== 'active') {
    // Disabled/expired tokens surface as the generic invalid-token error.
    throw new CloudflareApiError('invalid-token');
  }
  return result;
}

export async function listAccounts(token: string): Promise<CfAccountRef[]> {
  const result = await request<CfAccountRef[]>(
    '/accounts?per_page=50',
    token,
  );
  return result.map(({ id, name }) => ({ id, name }));
}

export interface CfZone {
  id: string;
  name: string;
  /** active | pending | initializing | moved | deleted | deactivated */
  status: string;
  paused: boolean;
  plan: string;
  accountId: string;
  accountName: string;
  nameServers: string[];
}

interface RawZone {
  id: string;
  name: string;
  status: string;
  paused?: boolean;
  plan?: { name?: string };
  account?: { id?: string; name?: string };
  name_servers?: string[];
}

function toZone(raw: RawZone): CfZone {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    paused: raw.paused ?? false,
    plan: raw.plan?.name ?? 'Free',
    accountId: raw.account?.id ?? '',
    accountName: raw.account?.name ?? '',
    nameServers: raw.name_servers ?? [],
  };
}

export async function listZones(token: string): Promise<CfZone[]> {
  const result = await request<RawZone[]>('/zones?per_page=50', token);
  return result.map(toZone);
}

export async function getZone(token: string, zoneId: string): Promise<CfZone> {
  const result = await request<RawZone>(`/zones/${zoneId}`, token);
  return toZone(result);
}

export async function getZoneSslMode(
  token: string,
  zoneId: string,
): Promise<string> {
  const result = await request<{ value: string }>(
    `/zones/${zoneId}/settings/ssl`,
    token,
  );
  return result.value;
}

/** Total DNS record count, cheap enough for the zone overview row. */
export async function countDnsRecords(
  token: string,
  zoneId: string,
): Promise<number> {
  const envelope = await requestEnvelope<unknown[]>(
    `/zones/${zoneId}/dns_records?per_page=1`,
    token,
  );
  return envelope.result_info?.total_count ?? envelope.result.length;
}

export interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export async function listDnsRecords(
  token: string,
  zoneId: string,
): Promise<CfDnsRecord[]> {
  const result = await request<
    {
      id: string;
      type: string;
      name: string;
      content?: string;
      proxied?: boolean;
      ttl?: number;
    }[]
  >(`/zones/${zoneId}/dns_records?per_page=100`, token);
  return result.map((record) => ({
    id: record.id,
    type: record.type,
    name: record.name,
    content: record.content ?? '',
    proxied: record.proxied ?? false,
    ttl: record.ttl ?? 1,
  }));
}

export interface DnsRecordInput {
  type: string;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  /** Required by Cloudflare for MX (and SRV/URI) records. */
  priority?: number;
}

export async function createDnsRecord(
  token: string,
  zoneId: string,
  input: DnsRecordInput,
): Promise<void> {
  await request(`/zones/${zoneId}/dns_records`, token, {
    method: 'POST',
    body: { ttl: 1, ...input },
  });
}

export async function updateDnsRecord(
  token: string,
  zoneId: string,
  recordId: string,
  input: DnsRecordInput,
): Promise<void> {
  await request(`/zones/${zoneId}/dns_records/${recordId}`, token, {
    method: 'PUT',
    body: input,
  });
}

export async function deleteDnsRecord(
  token: string,
  zoneId: string,
  recordId: string,
): Promise<void> {
  await request(`/zones/${zoneId}/dns_records/${recordId}`, token, {
    method: 'DELETE',
  });
}

export interface CfCertificatePack {
  id: string;
  type: string;
  hosts: string[];
  status: string;
  issuer: string;
  /** ISO date of the earliest certificate expiry in the pack, if known. */
  expiresOn: string | null;
}

export async function listCertificatePacks(
  token: string,
  zoneId: string,
): Promise<CfCertificatePack[]> {
  const result = await request<
    {
      id: string;
      type?: string;
      hosts?: string[];
      status?: string;
      certificate_authority?: string;
      certificates?: { expires_on?: string; issuer?: string }[];
    }[]
  >(`/zones/${zoneId}/ssl/certificate_packs?status=all`, token);
  return result.map((pack) => {
    const expiries = (pack.certificates ?? [])
      .map((certificate) => certificate.expires_on)
      .filter((value): value is string => Boolean(value))
      .sort();
    return {
      id: pack.id,
      type: pack.type ?? 'universal',
      hosts: pack.hosts ?? [],
      status: pack.status ?? 'unknown',
      issuer:
        pack.certificate_authority ??
        pack.certificates?.[0]?.issuer ??
        '',
      expiresOn: expiries[0] ?? null,
    };
  });
}

export async function purgeZoneCache(
  token: string,
  zoneId: string,
): Promise<void> {
  await request(`/zones/${zoneId}/purge_cache`, token, {
    method: 'POST',
    body: { purge_everything: true },
  });
}

export async function setZonePaused(
  token: string,
  zoneId: string,
  paused: boolean,
): Promise<CfZone> {
  const result = await request<RawZone>(`/zones/${zoneId}`, token, {
    method: 'PATCH',
    body: { paused },
  });
  return toZone(result);
}

export async function deleteZone(
  token: string,
  zoneId: string,
): Promise<void> {
  await request(`/zones/${zoneId}`, token, { method: 'DELETE' });
}
