import { mapLimit } from '../../utils/concurrency';
import { request } from './client';

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

/**
 * Object keys are path-like, and Cloudflare requires the separators to survive
 * intact: slashes MUST be sent literally while every other reserved character
 * MUST be percent-encoded. `encodeURIComponent` would turn `a/b` into `a%2Fb`
 * and address the wrong object, so each segment is encoded on its own.
 */
function encodeObjectKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

export async function deleteR2Object(
  token: string,
  accountId: string,
  bucket: string,
  key: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/r2/buckets/${bucket}/objects/${encodeObjectKey(key)}`,
    token,
    { method: 'DELETE' },
  );
}

export interface R2ObjectDeleteResult {
  deleted: string[];
  failed: { key: string; cause: unknown }[];
}

/**
 * Deletes several objects.
 *
 * Cloudflare's REST API has no bulk delete — that only exists in the
 * S3-compatible API, which needs separate access-key credentials this app does
 * not hold. So the calls are fanned out, capped so a large selection cannot
 * fire hundreds of parallel requests. Failures are collected instead of thrown:
 * a partial delete still happened and the caller has to be able to say so.
 */
export async function deleteR2Objects(
  token: string,
  accountId: string,
  bucket: string,
  keys: readonly string[],
): Promise<R2ObjectDeleteResult> {
  const outcomes = await mapLimit(keys, 6, async (key) => {
    try {
      await deleteR2Object(token, accountId, bucket, key);
      return { key, cause: null };
    } catch (cause) {
      return { key, cause };
    }
  });

  return {
    deleted: outcomes.filter((item) => !item.cause).map((item) => item.key),
    failed: outcomes
      .filter((item) => item.cause)
      .map(({ key, cause }) => ({ key, cause })),
  };
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
