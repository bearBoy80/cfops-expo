import {
  isInvalidListOptions,
  markLegacyListOptions,
  request,
  requestEnvelope,
  usesLegacyListOptions,
} from './client';

export interface CfWorkerScript {
  /** Script name; Cloudflare uses it as the identifier. */
  id: string;
  createdOn: string | null;
  modifiedOn: string | null;
}

interface RawWorkerScript {
  id: string;
  created_on?: string;
  modified_on?: string;
}

function toWorkerScript(script: RawWorkerScript): CfWorkerScript {
  return {
    id: script.id,
    createdOn: script.created_on ?? null,
    modifiedOn: script.modified_on ?? null,
  };
}

const SCRIPTS_PER_PAGE = 100;
const SCRIPTS_MAX_PAGES = 20;

async function listWorkerScriptsFast(
  token: string,
  accountId: string,
): Promise<CfWorkerScript[]> {
  const pagePath = (page: number) =>
    `/accounts/${accountId}/workers/scripts?page=${page}&per_page=${SCRIPTS_PER_PAGE}`;
  const first = await requestEnvelope<RawWorkerScript[]>(pagePath(1), token);
  const scripts = first.result.map(toWorkerScript);

  const info = first.result_info;
  const totalPages =
    info?.total_pages ??
    (info?.total_count && first.result.length > 0
      ? Math.ceil(info.total_count / first.result.length)
      : 1);
  const lastPage = Math.min(totalPages, SCRIPTS_MAX_PAGES);
  if (lastPage > 1 && first.result.length > 0) {
    // Remaining pages are independent once the first response reveals the
    // page count, so fetch them in parallel.
    const envelopes = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, index) =>
        requestEnvelope<RawWorkerScript[]>(pagePath(index + 2), token),
      ),
    );
    for (const envelope of envelopes) {
      scripts.push(...envelope.result.map(toWorkerScript));
    }
  }
  return scripts;
}

/**
 * Fetch without list options for accounts that reject them. Only `per_page`
 * is refused; `page` still works, so after the first page reveals the total
 * the remaining pages load in parallel.
 */
async function listWorkerScriptsLegacy(
  token: string,
  accountId: string,
): Promise<CfWorkerScript[]> {
  const pagePath = (page: number) =>
    `/accounts/${accountId}/workers/scripts?page=${page}`;
  const first = await requestEnvelope<RawWorkerScript[]>(pagePath(1), token);
  const scripts = first.result.map(toWorkerScript);

  const pageSize = first.result_info?.per_page ?? first.result.length;
  const total = first.result_info?.total_count ?? scripts.length;
  if (pageSize > 0 && total > scripts.length) {
    const totalPages = Math.min(
      Math.ceil(total / pageSize),
      SCRIPTS_MAX_PAGES,
    );
    const envelopes = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        requestEnvelope<RawWorkerScript[]>(pagePath(index + 2), token),
      ),
    );
    for (const envelope of envelopes) {
      scripts.push(...envelope.result.map(toWorkerScript));
    }
  }
  return scripts;
}

export async function listWorkerScripts(
  token: string,
  accountId: string,
): Promise<CfWorkerScript[]> {
  const legacyKey = `workers:${accountId}`;
  if (usesLegacyListOptions(legacyKey)) {
    return listWorkerScriptsLegacy(token, accountId);
  }
  try {
    return await listWorkerScriptsFast(token, accountId);
  } catch (cause) {
    if (!isInvalidListOptions(cause)) {
      throw cause;
    }
    // Remember the rejection so refreshes skip the doomed request entirely.
    markLegacyListOptions(legacyKey);
    return listWorkerScriptsLegacy(token, accountId);
  }
}

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
