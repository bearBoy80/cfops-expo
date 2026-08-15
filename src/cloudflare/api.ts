const API_BASE = 'https://api.cloudflare.com/client/v4';

export type CloudflareApiErrorCode =
  | 'invalid-token'
  | 'forbidden'
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
  forbidden: 'The credential lacks permission for this resource.',
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
  result_info?: { total_count?: number; total_pages?: number; cursor?: string };
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

  if (response.status === 401) {
    throw new CloudflareApiError('invalid-token');
  }

  let envelope: CfEnvelope<T>;
  try {
    envelope = (await response.json()) as CfEnvelope<T>;
  } catch {
    if (response.status === 403) {
      throw new CloudflareApiError('forbidden');
    }
    throw new CloudflareApiError('api');
  }

  const error = envelope.errors?.[0];
  // Cloudflare often returns 10000 "Authentication error" for a valid token
  // that is simply missing the resource permission (not a bad credential).
  const permissionDenied =
    response.status === 403 ||
    error?.code === 10000 ||
    error?.message === 'Authentication error';
  if (permissionDenied) {
    throw new CloudflareApiError('forbidden');
  }

  if (response.status >= 400 || envelope.success === false) {
    throw new CloudflareApiError('api', error?.message);
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

export interface RumSite {
  siteTag: string;
  zoneId: string | null;
  zoneName: string | null;
  hosts: string[];
}

interface RawRumSite {
  site_tag?: string;
  ruleset?: { zone_tag?: string; zone_name?: string };
  rules?: { host?: string }[];
}

/** Web Analytics sites for an account (the dashboard "Web Analytics" page). */
export async function listRumSites(
  token: string,
  accountId: string,
): Promise<RumSite[]> {
  const sites: RumSite[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const envelope = await requestEnvelope<RawRumSite[]>(
      `/accounts/${accountId}/rum/site_info/list?page=${page}`,
      token,
    );
    const batch = envelope.result ?? [];
    for (const item of batch) {
      if (!item.site_tag) {
        continue;
      }
      sites.push({
        siteTag: item.site_tag,
        zoneId: item.ruleset?.zone_tag ?? null,
        zoneName: item.ruleset?.zone_name ?? null,
        hosts: (item.rules ?? [])
          .map((rule) => rule.host)
          .filter((host): host is string => Boolean(host)),
      });
    }
    if (batch.length === 0) {
      break;
    }
    const totalPages = envelope.result_info?.total_pages;
    if (!totalPages || page >= totalPages) {
      break;
    }
  }
  return sites;
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

export type ZoneSecurityLevel =
  | 'off'
  | 'essentially_off'
  | 'low'
  | 'medium'
  | 'high'
  | 'under_attack';

export async function getZoneSecurityLevel(
  token: string,
  zoneId: string,
): Promise<ZoneSecurityLevel> {
  const result = await request<{ value: string }>(
    `/zones/${zoneId}/settings/security_level`,
    token,
  );
  return result.value as ZoneSecurityLevel;
}

export async function setZoneSecurityLevel(
  token: string,
  zoneId: string,
  value: ZoneSecurityLevel,
): Promise<void> {
  await request(`/zones/${zoneId}/settings/security_level`, token, {
    method: 'PATCH',
    body: { value },
  });
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

// ── R2 object storage ──────────────────────────────────────────────────────

export interface CfR2Bucket {
  name: string;
  /** Location hint such as WNAM / ENAM / WEUR / EEUR / APAC, if set. */
  location: string;
  creationDate: string | null;
}

export async function listR2Buckets(
  token: string,
  accountId: string,
): Promise<CfR2Bucket[]> {
  // Note: this endpoint rejects the common `per_page` list option.
  const result = await request<{
    buckets?: { name: string; location?: string; creation_date?: string }[];
  }>(`/accounts/${accountId}/r2/buckets`, token);
  return (result.buckets ?? []).map((bucket) => ({
    name: bucket.name,
    location: bucket.location ?? '',
    creationDate: bucket.creation_date ?? null,
  }));
}

export async function createR2Bucket(
  token: string,
  accountId: string,
  name: string,
  locationHint?: string,
): Promise<void> {
  await request(`/accounts/${accountId}/r2/buckets`, token, {
    method: 'POST',
    body: { name, ...(locationHint ? { locationHint } : {}) },
  });
}

export async function deleteR2Bucket(
  token: string,
  accountId: string,
  name: string,
): Promise<void> {
  await request(`/accounts/${accountId}/r2/buckets/${name}`, token, {
    method: 'DELETE',
  });
}

export interface CfR2Object {
  key: string;
  size: number;
  lastModified: string | null;
}

/** First page of objects in a bucket; enough for the mobile detail view. */
export async function listR2Objects(
  token: string,
  accountId: string,
  bucket: string,
): Promise<CfR2Object[]> {
  const result = await request<
    { key: string; size?: number; last_modified?: string }[]
  >(`/accounts/${accountId}/r2/buckets/${bucket}/objects`, token);
  return (result ?? []).map((object) => ({
    key: object.key,
    size: object.size ?? 0,
    lastModified: object.last_modified ?? null,
  }));
}

export interface CfR2ManagedDomain {
  domain: string;
  enabled: boolean;
}

export async function getR2ManagedDomain(
  token: string,
  accountId: string,
  bucket: string,
): Promise<CfR2ManagedDomain> {
  const result = await request<{ domain?: string; enabled?: boolean }>(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/managed`,
    token,
  );
  return {
    domain: result.domain ?? '',
    enabled: result.enabled ?? false,
  };
}

export async function setR2ManagedDomain(
  token: string,
  accountId: string,
  bucket: string,
  enabled: boolean,
): Promise<void> {
  await request(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/managed`,
    token,
    { method: 'PUT', body: { enabled } },
  );
}

export interface CfR2CustomDomain {
  domain: string;
  enabled: boolean;
  status: string;
  zoneId: string;
  zoneName: string;
}

export async function listR2CustomDomains(
  token: string,
  accountId: string,
  bucket: string,
): Promise<CfR2CustomDomain[]> {
  const result = await request<
    | {
        domains?: {
          domain: string;
          enabled?: boolean;
          status?: { ownership?: string; ssl?: string } | string;
          zoneId?: string;
          zoneName?: string;
        }[];
      }
    | {
        domain: string;
        enabled?: boolean;
        status?: { ownership?: string; ssl?: string } | string;
        zoneId?: string;
        zoneName?: string;
      }[]
  >(`/accounts/${accountId}/r2/buckets/${bucket}/domains/custom`, token);
  const items = Array.isArray(result) ? result : (result.domains ?? []);
  return items.map((domain) => ({
    domain: domain.domain,
    enabled: domain.enabled ?? true,
    status:
      typeof domain.status === 'string'
        ? domain.status
        : (domain.status?.ownership ?? domain.status?.ssl ?? 'pending'),
    zoneId: domain.zoneId ?? '',
    zoneName: domain.zoneName ?? '',
  }));
}

export async function addR2CustomDomain(
  token: string,
  accountId: string,
  bucket: string,
  input: { domain: string; zoneId: string },
): Promise<void> {
  await request(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/custom`,
    token,
    {
      method: 'POST',
      body: { domain: input.domain, zoneId: input.zoneId, enabled: true },
    },
  );
}

export async function deleteR2CustomDomain(
  token: string,
  accountId: string,
  bucket: string,
  domain: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/custom/${domain}`,
    token,
    { method: 'DELETE' },
  );
}

// ── Workers KV ─────────────────────────────────────────────────────────────

export interface CfKvNamespace {
  id: string;
  title: string;
}

export async function listKvNamespaces(
  token: string,
  accountId: string,
): Promise<CfKvNamespace[]> {
  const namespaces: CfKvNamespace[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const envelope = await requestEnvelope<{ id: string; title: string }[]>(
      `/accounts/${accountId}/storage/kv/namespaces?page=${page}`,
      token,
    );
    namespaces.push(...envelope.result.map(({ id, title }) => ({ id, title })));
    const total = envelope.result_info?.total_count ?? namespaces.length;
    if (namespaces.length >= total || envelope.result.length === 0) {
      break;
    }
  }
  return namespaces;
}

export async function createKvNamespace(
  token: string,
  accountId: string,
  title: string,
): Promise<void> {
  await request(`/accounts/${accountId}/storage/kv/namespaces`, token, {
    method: 'POST',
    body: { title },
  });
}

export async function deleteKvNamespace(
  token: string,
  accountId: string,
  namespaceId: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`,
    token,
    { method: 'DELETE' },
  );
}

export interface CfKvKey {
  name: string;
  expiration: number | null;
}

/** First pages of keys; enough for the mobile detail view. */
export async function listKvKeys(
  token: string,
  accountId: string,
  namespaceId: string,
): Promise<CfKvKey[]> {
  const keys: CfKvKey[] = [];
  let cursor = '';
  for (let page = 1; page <= 5; page += 1) {
    const query = cursor
      ? `?limit=100&cursor=${encodeURIComponent(cursor)}`
      : '?limit=100';
    const envelope = await requestEnvelope<{ name: string; expiration?: number }[]>(
      `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys${query}`,
      token,
    );
    keys.push(
      ...envelope.result.map((key) => ({
        name: key.name,
        expiration: key.expiration ?? null,
      })),
    );
    const next = envelope.result_info?.cursor;
    if (!next || envelope.result.length === 0) {
      break;
    }
    cursor = next;
  }
  return keys;
}

// ── D1 databases ───────────────────────────────────────────────────────────

export interface CfD1Database {
  uuid: string;
  name: string;
  version: string;
  createdAt: string | null;
  /** Bytes; only present when the list/detail response includes it. */
  fileSize: number | null;
  numTables: number | null;
}

interface RawD1Database {
  uuid: string;
  name: string;
  version?: string;
  created_at?: string;
  file_size?: number;
  num_tables?: number;
}

function toD1Database(raw: RawD1Database): CfD1Database {
  return {
    uuid: raw.uuid,
    name: raw.name,
    version: raw.version ?? '',
    createdAt: raw.created_at ?? null,
    fileSize: raw.file_size ?? null,
    numTables: raw.num_tables ?? null,
  };
}

export async function listD1Databases(
  token: string,
  accountId: string,
): Promise<CfD1Database[]> {
  const databases: CfD1Database[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const envelope = await requestEnvelope<RawD1Database[]>(
      `/accounts/${accountId}/d1/database?page=${page}`,
      token,
    );
    databases.push(...envelope.result.map(toD1Database));
    const total = envelope.result_info?.total_count ?? databases.length;
    if (databases.length >= total || envelope.result.length === 0) {
      break;
    }
  }
  return databases;
}

/** Detail lookup fills in file_size / num_tables missing from the list. */
export async function getD1Database(
  token: string,
  accountId: string,
  databaseId: string,
): Promise<CfD1Database> {
  const result = await request<RawD1Database>(
    `/accounts/${accountId}/d1/database/${databaseId}`,
    token,
  );
  return toD1Database(result);
}

export async function createD1Database(
  token: string,
  accountId: string,
  name: string,
): Promise<void> {
  await request(`/accounts/${accountId}/d1/database`, token, {
    method: 'POST',
    body: { name },
  });
}

export async function deleteD1Database(
  token: string,
  accountId: string,
  databaseId: string,
): Promise<void> {
  await request(`/accounts/${accountId}/d1/database/${databaseId}`, token, {
    method: 'DELETE',
  });
}

export async function listD1Tables(
  token: string,
  accountId: string,
  databaseId: string,
): Promise<string[]> {
  const result = await request<{ results?: { name?: string }[] }[]>(
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    token,
    {
      method: 'POST',
      body: {
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
      },
    },
  );
  return (result[0]?.results ?? [])
    .map((row) => row.name)
    .filter((name): name is string => Boolean(name));
}

// ── Workers & Pages ────────────────────────────────────────────────────────

export interface CfWorkerScript {
  /** Script name; Cloudflare uses it as the identifier. */
  id: string;
  createdOn: string | null;
  modifiedOn: string | null;
}

export async function listWorkerScripts(
  token: string,
  accountId: string,
): Promise<CfWorkerScript[]> {
  const scripts: CfWorkerScript[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const envelope = await requestEnvelope<
      { id: string; created_on?: string; modified_on?: string }[]
    >(`/accounts/${accountId}/workers/scripts?page=${page}`, token);
    scripts.push(
      ...envelope.result.map((script) => ({
        id: script.id,
        createdOn: script.created_on ?? null,
        modifiedOn: script.modified_on ?? null,
      })),
    );
    const total = envelope.result_info?.total_count ?? scripts.length;
    if (scripts.length >= total || envelope.result.length === 0) {
      break;
    }
  }
  return scripts;
}

export interface CfPagesProject {
  name: string;
  /** Primary domain (first of `domains`). */
  domain: string;
  productionBranch: string;
  framework: string;
  /** Underlying Worker script serving Pages Functions, if any. */
  productionScriptName: string | null;
  /** latest deployment info; nulls when the project was never deployed */
  deployStatus: 'success' | 'failure' | 'building' | 'unknown' | null;
  deployBranch: string | null;
  deployCommit: string | null;
  deployedAt: string | null;
}

interface RawPagesProject {
  name: string;
  domains?: string[];
  production_branch?: string;
  production_script_name?: string;
  build_config?: { framework?: string };
  latest_deployment?: {
    deployment_trigger?: { metadata?: { branch?: string; commit_hash?: string } };
    latest_stage?: { name?: string; status?: string };
    created_on?: string;
  };
}

function toDeployStatus(
  stage?: { name?: string; status?: string },
): CfPagesProject['deployStatus'] {
  if (!stage?.status) {
    return 'unknown';
  }
  if (stage.status === 'success' && stage.name === 'deploy') {
    return 'success';
  }
  if (stage.status === 'failure' || stage.status === 'failed') {
    return 'failure';
  }
  if (stage.status === 'success' || stage.status === 'active' || stage.status === 'idle') {
    // A non-final stage succeeded or is running: still building.
    return 'building';
  }
  return 'unknown';
}

// ── Worker versions, deployments & custom domains ─────────────────────────

export interface CfWorkerVersion {
  id: string;
  number: number | null;
  createdOn: string | null;
  message: string | null;
}

interface RawWorkerVersion {
  id: string;
  number?: number;
  metadata?: { created_on?: string };
  annotations?: { 'workers/message'?: string; 'workers/tag'?: string };
}

/** Recent versions of a Worker script, newest first. */
export async function listWorkerVersions(
  token: string,
  accountId: string,
  scriptName: string,
): Promise<CfWorkerVersion[]> {
  const result = await request<
    { items?: RawWorkerVersion[] } | RawWorkerVersion[]
  >(`/accounts/${accountId}/workers/scripts/${scriptName}/versions`, token);
  const items = Array.isArray(result) ? result : (result.items ?? []);
  return items.map((version) => ({
    id: version.id,
    number: version.number ?? null,
    createdOn: version.metadata?.created_on ?? null,
    message:
      version.annotations?.['workers/message'] ??
      version.annotations?.['workers/tag'] ??
      null,
  }));
}

/** Version id currently serving 100% (or the largest share) of traffic. */
export async function getActiveWorkerVersion(
  token: string,
  accountId: string,
  scriptName: string,
): Promise<string | null> {
  const result = await request<{
    deployments?: {
      versions?: { version_id?: string; percentage?: number }[];
    }[];
  }>(
    `/accounts/${accountId}/workers/scripts/${scriptName}/deployments`,
    token,
  );
  const versions = result.deployments?.[0]?.versions ?? [];
  const top = [...versions].sort(
    (a, b) => (b.percentage ?? 0) - (a.percentage ?? 0),
  )[0];
  return top?.version_id ?? null;
}

/** Points 100% of traffic at the given version (Workers rollback). */
export async function rollbackWorkerVersion(
  token: string,
  accountId: string,
  scriptName: string,
  versionId: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/workers/scripts/${scriptName}/deployments?force=true`,
    token,
    {
      method: 'POST',
      body: {
        strategy: 'percentage',
        versions: [{ version_id: versionId, percentage: 100 }],
      },
    },
  );
}

/** workers.dev exposure of a script: live subdomain and version previews. */
export interface CfWorkerSubdomainConfig {
  enabled: boolean;
  previewsEnabled: boolean;
}

export async function getWorkerSubdomainConfig(
  token: string,
  accountId: string,
  scriptName: string,
): Promise<CfWorkerSubdomainConfig> {
  const result = await request<{
    enabled?: boolean;
    previews_enabled?: boolean;
  }>(`/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`, token);
  return {
    enabled: result.enabled ?? false,
    previewsEnabled: result.previews_enabled ?? false,
  };
}

export async function setWorkerSubdomainConfig(
  token: string,
  accountId: string,
  scriptName: string,
  config: CfWorkerSubdomainConfig,
): Promise<void> {
  await request(
    `/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
    token,
    {
      method: 'POST',
      body: {
        enabled: config.enabled,
        previews_enabled: config.previewsEnabled,
      },
    },
  );
}

export interface CfWorkerDomain {
  id: string;
  hostname: string;
  service: string;
  environment: string;
  zoneId: string;
  zoneName: string;
}

export async function listWorkerDomains(
  token: string,
  accountId: string,
  service?: string,
): Promise<CfWorkerDomain[]> {
  const result = await request<
    {
      id: string;
      hostname?: string;
      service?: string;
      environment?: string;
      zone_id?: string;
      zone_name?: string;
    }[]
  >(`/accounts/${accountId}/workers/domains`, token);
  return result
    .map((domain) => ({
      id: domain.id,
      hostname: domain.hostname ?? '',
      service: domain.service ?? '',
      environment: domain.environment ?? 'production',
      zoneId: domain.zone_id ?? '',
      zoneName: domain.zone_name ?? '',
    }))
    .filter((domain) => !service || domain.service === service);
}

export async function attachWorkerDomain(
  token: string,
  accountId: string,
  input: { zoneId: string; hostname: string; service: string },
): Promise<void> {
  await request(`/accounts/${accountId}/workers/domains`, token, {
    method: 'PUT',
    body: {
      zone_id: input.zoneId,
      hostname: input.hostname,
      service: input.service,
      environment: 'production',
    },
  });
}

export async function detachWorkerDomain(
  token: string,
  accountId: string,
  domainId: string,
): Promise<void> {
  await request(`/accounts/${accountId}/workers/domains/${domainId}`, token, {
    method: 'DELETE',
  });
}

// ── Pages deployments & custom domains ────────────────────────────────────

export interface CfPagesDeployment {
  id: string;
  /** production | preview */
  environment: string;
  branch: string | null;
  commit: string | null;
  status: 'success' | 'failure' | 'building' | 'unknown';
  createdOn: string | null;
  url: string;
}

export async function listPagesDeployments(
  token: string,
  accountId: string,
  projectName: string,
): Promise<CfPagesDeployment[]> {
  const result = await request<
    {
      id: string;
      environment?: string;
      url?: string;
      created_on?: string;
      deployment_trigger?: {
        metadata?: { branch?: string; commit_hash?: string };
      };
      latest_stage?: { name?: string; status?: string };
    }[]
  >(`/accounts/${accountId}/pages/projects/${projectName}/deployments`, token);
  return result.map((deployment) => ({
    id: deployment.id,
    environment: deployment.environment ?? 'production',
    branch: deployment.deployment_trigger?.metadata?.branch ?? null,
    commit:
      deployment.deployment_trigger?.metadata?.commit_hash?.slice(0, 7) ??
      null,
    status: toDeployStatus(deployment.latest_stage) ?? 'unknown',
    createdOn: deployment.created_on ?? null,
    url: deployment.url ?? '',
  }));
}

/** Re-publishes an older deployment as the current production one. */
export async function rollbackPagesDeployment(
  token: string,
  accountId: string,
  projectName: string,
  deploymentId: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/rollback`,
    token,
    { method: 'POST' },
  );
}

/** Re-runs the build of a failed or cancelled deployment. */
export async function retryPagesDeployment(
  token: string,
  accountId: string,
  projectName: string,
  deploymentId: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/retry`,
    token,
    { method: 'POST' },
  );
}

export type PagesPreviewSetting = 'all' | 'none' | 'custom';

/**
 * Preview-deployment policy of a git-connected project, or null for
 * direct-upload projects (which have no preview builds to disable).
 */
export async function getPagesPreviewSetting(
  token: string,
  accountId: string,
  projectName: string,
): Promise<PagesPreviewSetting | null> {
  const project = await request<{
    source?: { config?: { preview_deployment_setting?: string } };
  }>(`/accounts/${accountId}/pages/projects/${projectName}`, token);
  if (!project.source) {
    return null;
  }
  const setting = project.source.config?.preview_deployment_setting;
  return setting === 'none' || setting === 'custom' ? setting : 'all';
}

export async function setPagesPreviewSetting(
  token: string,
  accountId: string,
  projectName: string,
  setting: 'all' | 'none',
): Promise<void> {
  // Read-modify-write: patching a partial source object would drop the
  // repo binding and other config fields.
  const project = await request<{
    source?: { type?: string; config?: Record<string, unknown> };
  }>(`/accounts/${accountId}/pages/projects/${projectName}`, token);
  if (!project.source) {
    throw new CloudflareApiError('api');
  }
  await request(`/accounts/${accountId}/pages/projects/${projectName}`, token, {
    method: 'PATCH',
    body: {
      source: {
        ...project.source,
        config: {
          ...project.source.config,
          preview_deployment_setting: setting,
        },
      },
    },
  });
}

export interface CfPagesDomain {
  id: string;
  name: string;
  status: string;
}

export async function listPagesDomains(
  token: string,
  accountId: string,
  projectName: string,
): Promise<CfPagesDomain[]> {
  const result = await request<
    { id?: string; name: string; status?: string }[]
  >(`/accounts/${accountId}/pages/projects/${projectName}/domains`, token);
  return result.map((domain) => ({
    id: domain.id ?? domain.name,
    name: domain.name,
    status: domain.status ?? 'active',
  }));
}

export async function addPagesDomain(
  token: string,
  accountId: string,
  projectName: string,
  name: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/pages/projects/${projectName}/domains`,
    token,
    { method: 'POST', body: { name } },
  );
}

export async function deletePagesDomain(
  token: string,
  accountId: string,
  projectName: string,
  name: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/pages/projects/${projectName}/domains/${name}`,
    token,
    { method: 'DELETE' },
  );
}

export async function listPagesProjects(
  token: string,
  accountId: string,
): Promise<CfPagesProject[]> {
  const projects: CfPagesProject[] = [];
  // The Pages projects endpoint returns only 10 items per page by default.
  for (let page = 1; page <= 20; page += 1) {
    const envelope = await requestEnvelope<RawPagesProject[]>(
      `/accounts/${accountId}/pages/projects?page=${page}`,
      token,
    );
    projects.push(
      ...envelope.result.map((project) => {
        const deployment = project.latest_deployment;
        return {
          name: project.name,
          domain: project.domains?.[0] ?? '',
          productionBranch: project.production_branch ?? '',
          framework: project.build_config?.framework ?? '',
          productionScriptName: project.production_script_name ?? null,
          deployStatus: deployment
            ? toDeployStatus(deployment.latest_stage)
            : null,
          deployBranch:
            deployment?.deployment_trigger?.metadata?.branch ?? null,
          deployCommit:
            deployment?.deployment_trigger?.metadata?.commit_hash?.slice(
              0,
              7,
            ) ?? null,
          deployedAt: deployment?.created_on ?? null,
        };
      }),
    );
    const total = envelope.result_info?.total_count ?? projects.length;
    if (projects.length >= total || envelope.result.length === 0) {
      break;
    }
  }
  return projects;
}

export interface CfAlert {
  id: string;
  title: string;
  detail: string;
  type: string;
  sent: string;
}

interface RawAlert {
  id?: string;
  name?: string;
  alert_type?: string;
  alert_body?: string;
  description?: string;
  sent?: string;
}

function toAlert(item: RawAlert, index: number): CfAlert {
  return {
    id: item.id ?? `${item.alert_type ?? 'alert'}-${item.sent ?? index}`,
    title: item.name || item.alert_type || 'alert',
    detail: item.alert_body || item.description || '',
    type: item.alert_type ?? '',
    sent: item.sent ?? '',
  };
}

export async function listAlertHistory(
  token: string,
  accountId: string,
): Promise<CfAlert[]> {
  const paths = [
    `/accounts/${accountId}/alerting/v3/history?page=1&per_page=25`,
    `/accounts/${accountId}/alerting/v3/history`,
    `/accounts/${accountId}/alerting/v3/policies`,
  ];
  let lastError: unknown;
  for (const path of paths) {
    try {
      const result = await request<RawAlert[] | null>(path, token);
      return (result ?? []).map(toAlert);
    } catch (cause) {
      lastError = cause;
      if (
        !(cause instanceof CloudflareApiError) ||
        (cause.code !== 'forbidden' && cause.code !== 'api')
      ) {
        throw cause;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new CloudflareApiError('api');
}

export interface CfLoadBalancer {
  id: string;
  name: string;
  enabled: boolean;
  steering: string;
  poolIds: string[];
}

export interface CfLoadBalancerPool {
  id: string;
  name: string;
  enabled: boolean;
  originCount: number;
  originEnabled: number;
}

interface RawLoadBalancer {
  id?: string;
  name?: string;
  enabled?: boolean;
  steering_policy?: string;
  default_pools?: string[];
  fallback_pool?: string;
}

interface RawLoadBalancerPool {
  id?: string;
  name?: string;
  enabled?: boolean;
  origins?: { enabled?: boolean }[];
}

function toLoadBalancer(item: RawLoadBalancer & { id: string }): CfLoadBalancer {
  const poolIds = [...(item.default_pools ?? [])];
  if (item.fallback_pool && !poolIds.includes(item.fallback_pool)) {
    poolIds.push(item.fallback_pool);
  }
  return {
    id: item.id,
    name: item.name ?? item.id,
    enabled: item.enabled !== false,
    steering: item.steering_policy || 'off',
    poolIds,
  };
}

function mapLoadBalancers(result: RawLoadBalancer[] | null): CfLoadBalancer[] {
  return (result ?? [])
    .filter((item): item is RawLoadBalancer & { id: string } => Boolean(item.id))
    .map(toLoadBalancer);
}

export async function listLoadBalancers(
  token: string,
  accountId: string,
): Promise<CfLoadBalancer[]> {
  const result = await request<RawLoadBalancer[] | null>(
    `/accounts/${accountId}/load_balancers`,
    token,
  );
  return mapLoadBalancers(result);
}

/** Zone-scoped LBs. Dashboard "Load Balancers Read" maps to this path. */
export async function listZoneLoadBalancers(
  token: string,
  zoneId: string,
): Promise<CfLoadBalancer[]> {
  const result = await request<RawLoadBalancer[] | null>(
    `/zones/${zoneId}/load_balancers`,
    token,
  );
  return mapLoadBalancers(result);
}

export async function listLoadBalancerPools(
  token: string,
  accountId: string,
): Promise<CfLoadBalancerPool[]> {
  const result = await request<RawLoadBalancerPool[] | null>(
    `/accounts/${accountId}/load_balancers/pools`,
    token,
  );
  return (result ?? [])
    .filter((item): item is RawLoadBalancerPool & { id: string } =>
      Boolean(item.id),
    )
    .map((item) => {
      const origins = item.origins ?? [];
      return {
        id: item.id,
        name: item.name ?? item.id,
        enabled: item.enabled !== false,
        originCount: origins.length,
        originEnabled: origins.filter((origin) => origin.enabled !== false)
          .length,
      };
    });
}

export type AuditActionKind =
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'other';

export interface CfAuditEntry {
  id: string;
  action: string;
  actionKind: AuditActionKind;
  result: 'success' | 'failure' | '';
  resource: string;
  resourceId: string;
  zone: string;
  actor: string;
  actorKind: 'user' | 'token' | 'system' | 'other';
  ip: string;
  when: string;
}

interface RawAuditEntry {
  id?: string;
  action?: {
    type?: string;
    description?: string;
    time?: string;
    result?: string;
  };
  actor?: {
    email?: string;
    type?: string;
    ip?: string;
    ip_address?: string;
    id?: string;
    token_name?: string;
  };
  resource?: { type?: string; id?: string; product?: string };
  zone?: { name?: string };
  when?: string;
}

function parseActionKind(type?: string, description?: string): AuditActionKind {
  const value = `${type ?? ''} ${description ?? ''}`.toLowerCase();
  if (/(^|[._\s])(create|add|insert)\b/.test(value)) {
    return 'create';
  }
  if (/(^|[._\s])(delete|remove|destroy)\b/.test(value)) {
    return 'delete';
  }
  if (/(^|[._\s])(view|read|login|logout|list)\b/.test(value)) {
    return 'view';
  }
  if (/(^|[._\s])(update|edit|modify|change|purge|patch)\b/.test(value)) {
    return 'update';
  }
  return 'other';
}

function parseActorKind(
  type?: string,
  tokenName?: string,
): CfAuditEntry['actorKind'] {
  const value = (type ?? '').toLowerCase();
  if (value === 'user') {
    return 'user';
  }
  if (value === 'token' || tokenName) {
    return 'token';
  }
  if (value === 'system' || value === 'cloudflare' || value === 'cloudflare_admin') {
    return 'system';
  }
  return 'other';
}

function toAuditEntry(item: RawAuditEntry, index: number): CfAuditEntry {
  const when = item.action?.time || item.when || '';
  const actor =
    item.actor?.email ||
    item.actor?.token_name ||
    (item.actor?.type === 'token' && item.actor.id
      ? `api-token:${item.actor.id.slice(0, 8)}`
      : item.actor?.type) ||
    'unknown';
  const result = (item.action?.result ?? '').toLowerCase();
  return {
    id: item.id ?? `${when || 'audit'}-${index}`,
    action: item.action?.description || item.action?.type || 'action',
    actionKind: parseActionKind(item.action?.type, item.action?.description),
    result: result === 'failure' || result === 'success' ? result : '',
    resource: item.resource?.type || item.resource?.product || '',
    resourceId:
      item.resource?.id && item.resource.id !== item.resource.type
        ? item.resource.id
        : '',
    zone: item.zone?.name ?? '',
    actor,
    actorKind: parseActorKind(item.actor?.type, item.actor?.token_name),
    ip: item.actor?.ip_address || item.actor?.ip || '',
    when,
  };
}

function rfc3339(at: number): string {
  return new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function listAuditLogs(
  token: string,
  accountId: string,
): Promise<CfAuditEntry[]> {
  const beforeAt = Date.now();
  const sinceAt = beforeAt - 7 * 24 * 60 * 60 * 1000;
  const since = rfc3339(sinceAt);
  const before = rfc3339(beforeAt);
  const sinceDay = since.slice(0, 10);
  const beforeDay = before.slice(0, 10);
  // v2 requires since+before. Official permission is Account Settings Read;
  // "Audit Logs Read" is rejected as Authentication error (10000).
  const attempts = [
    `/accounts/${accountId}/logs/audit?since=${encodeURIComponent(since)}&before=${encodeURIComponent(before)}`,
    `/accounts/${accountId}/logs/audit?since=${sinceDay}&before=${beforeDay}`,
    `/accounts/${accountId}/audit_logs?per_page=25`,
    `/user/audit_logs?per_page=25`,
  ];
  let lastError: unknown;
  for (const path of attempts) {
    try {
      const result = await request<RawAuditEntry[] | null>(path, token);
      return (result ?? []).map(toAuditEntry);
    } catch (cause) {
      lastError = cause;
      if (
        !(cause instanceof CloudflareApiError) ||
        (cause.code !== 'forbidden' && cause.code !== 'api')
      ) {
        throw cause;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new CloudflareApiError('api');
}

export interface CfSubscription {
  id: string;
  name: string;
  planId: string;
  scope: string;
  frequency: string;
  state: string;
  price: number;
  currency: string;
  extras: string;
  started: string | null;
  ended: string | null;
}

interface RawSubscription {
  id?: string;
  price?: number;
  currency?: string;
  frequency?: string;
  state?: string;
  current_period_start?: string;
  current_period_end?: string;
  product?: { name?: string; key?: string };
  rate_plan?: {
    id?: string;
    public_name?: string;
    currency?: string;
    scope?: string;
  };
  current?: { started?: string; ended?: string };
  component_values?: { name?: string; value?: number }[];
}

function humanizeBillingKey(value: string): string {
  return value
    .replace(/^prod_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function listSubscriptions(
  token: string,
  accountId: string,
): Promise<CfSubscription[]> {
  const result = await request<RawSubscription[] | null>(
    `/accounts/${accountId}/subscriptions`,
    token,
  );
  return (result ?? []).map((item, index) => {
    return {
      id: item.id ?? `${item.rate_plan?.id ?? item.product?.key ?? 'sub'}-${index}`,
      name:
        item.rate_plan?.public_name ||
        (item.rate_plan?.id ? humanizeBillingKey(item.rate_plan.id) : '') ||
        (item.product?.name ? humanizeBillingKey(item.product.name) : '') ||
        'Subscription',
      planId: item.rate_plan?.id ?? '',
      scope: item.rate_plan?.scope ?? '',
      frequency: item.frequency ?? '',
      state: item.state ?? '',
      price: item.price ?? 0,
      currency: item.currency || item.rate_plan?.currency || 'USD',
      extras: '',
      started: item.current_period_start ?? item.current?.started ?? null,
      ended: item.current_period_end ?? item.current?.ended ?? null,
    };
  });
}
