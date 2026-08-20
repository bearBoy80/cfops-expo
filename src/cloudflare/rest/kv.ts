import { mapLimit } from '../../utils/concurrency';
import { CloudflareApiError, request, requestEnvelope } from './client';

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

export interface CfKvEntry {
  value: string;
  /**
   * Kept verbatim rather than parsed: an edit has to write it back untouched,
   * and this app never displays or interprets it.
   */
  metadata: unknown;
  expiration: number | null;
}

interface BulkGetEntry {
  value?: unknown;
  metadata?: unknown;
  expiration?: number;
}

/** Hard limit of the bulk read endpoint. */
const BULK_GET_BATCH = 100;

/**
 * `type: 'text'` should already hand back strings, but the endpoint's schema
 * also allows numbers, booleans and objects, so a stray value cannot be
 * rendered straight into a `<Text>`.
 */
function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  return JSON.stringify(value) ?? '';
}

/**
 * Values (plus metadata and expiry) for the given keys, batched into the 100
 * per request the API allows. Keys that no longer exist are simply absent from
 * the result.
 */
export async function getKvEntries(
  token: string,
  accountId: string,
  namespaceId: string,
  keys: readonly string[],
): Promise<Map<string, CfKvEntry>> {
  const entries = new Map<string, CfKvEntry>();
  if (keys.length === 0) {
    return entries;
  }
  const batches: string[][] = [];
  for (let start = 0; start < keys.length; start += BULK_GET_BATCH) {
    batches.push(keys.slice(start, start + BULK_GET_BATCH));
  }
  const results = await mapLimit(batches, 3, (batch) =>
    request<{ values?: Record<string, BulkGetEntry | null> } | null>(
      `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk/get`,
      token,
      {
        method: 'POST',
        body: { keys: batch, type: 'text', withMetadata: true },
      },
    ),
  );
  for (const result of results) {
    for (const [key, entry] of Object.entries(result?.values ?? {})) {
      if (entry == null) {
        continue;
      }
      entries.set(key, {
        value: asText(entry.value),
        metadata: entry.metadata ?? null,
        expiration:
          typeof entry.expiration === 'number' ? entry.expiration : null,
      });
    }
  }
  return entries;
}

interface BulkWriteResult {
  successful_key_count?: number;
  unsuccessful_keys?: string[];
}

/**
 * Writes one key through the bulk endpoint, which takes JSON — the single-key
 * route is multipart/form-data for no gain here.
 *
 * A bulk write replaces the whole record, so metadata and expiry have to be
 * passed back in or editing a value would quietly strip them.
 */
export async function putKvValue(
  token: string,
  accountId: string,
  namespaceId: string,
  entry: {
    key: string;
    value: string;
    metadata?: unknown;
    expiration?: number | null;
  },
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const result = await request<BulkWriteResult | null>(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
    token,
    {
      method: 'PUT',
      body: [
        {
          key: entry.key,
          value: entry.value,
          // An expiry already in the past is rejected by the API, so let the
          // key keep its natural end instead of failing the whole write.
          ...(entry.expiration != null && entry.expiration > nowSeconds
            ? { expiration: entry.expiration }
            : {}),
          ...(entry.metadata != null ? { metadata: entry.metadata } : {}),
        },
      ],
    },
  );
  if (result?.unsuccessful_keys?.includes(entry.key)) {
    throw new CloudflareApiError('api');
  }
}

export interface KvKeyDeleteResult {
  deleted: string[];
  failed: string[];
}

/**
 * Deletes one or many keys in a single call. Failures come back in the result
 * rather than as a throw: a partial delete still happened, and the caller has
 * to be able to say so.
 */
export async function deleteKvKeys(
  token: string,
  accountId: string,
  namespaceId: string,
  keys: readonly string[],
): Promise<KvKeyDeleteResult> {
  const result = await request<BulkWriteResult | null>(
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk/delete`,
    token,
    { method: 'POST', body: keys },
  );
  /*
   * A successful envelope can still carry `result: null`, as several delete
   * endpoints do. Reading through it would throw and turn a delete that
   * actually happened into an error the caller reports to the user.
   */
  const failed = result?.unsuccessful_keys ?? [];
  return {
    deleted: keys.filter((key) => !failed.includes(key)),
    failed,
  };
}
