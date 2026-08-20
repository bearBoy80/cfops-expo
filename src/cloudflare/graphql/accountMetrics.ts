import { createKeyedTtlCache } from '../ttlCache';
import { fillHourlySeries, last24hIso, runAccountQuery } from './client';

// ── Account-level datasets (Workers / R2 / KV / D1) ────────────────────────

const METRICS_TTL_MS = 60_000;

/** Per-script Worker invocation totals over the last 24 hours. */
export interface WorkerMetrics {
  requests: number;
  errors: number;
  /** Median CPU time in milliseconds, or null when unavailable. */
  cpuP50Ms: number | null;
}

const WORKERS_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 500, filter: { datetime_geq: $since }) {
        sum { requests errors }
        quantiles { cpuTimeP50 }
        dimensions { scriptName }
      }
    }
  }
}`;

async function fetchWorkerMetricsUncached(
  bearer: string,
  accountId: string,
): Promise<Map<string, WorkerMetrics>> {
  const accounts = await runAccountQuery<{
    workersInvocationsAdaptive?: {
      sum?: { requests?: number; errors?: number };
      quantiles?: { cpuTimeP50?: number };
      dimensions?: { scriptName?: string };
    }[];
  }>(bearer, WORKERS_QUERY, { account: accountId, since: last24hIso() });

  const metrics = new Map<string, WorkerMetrics>();
  for (const account of accounts) {
    for (const group of account.workersInvocationsAdaptive ?? []) {
      const script = group.dimensions?.scriptName;
      if (!script) {
        continue;
      }
      const existing = metrics.get(script) ?? {
        requests: 0,
        errors: 0,
        cpuP50Ms: null,
      };
      existing.requests += group.sum?.requests ?? 0;
      existing.errors += group.sum?.errors ?? 0;
      const cpuMicros = group.quantiles?.cpuTimeP50;
      if (cpuMicros !== undefined && cpuMicros !== null) {
        existing.cpuP50Ms = Math.max(existing.cpuP50Ms ?? 0, cpuMicros / 1000);
      }
      metrics.set(script, existing);
    }
  }
  return metrics;
}

const workerMetricsCache = createKeyedTtlCache<
  Map<string, WorkerMetrics>,
  string,
  [string]
>(METRICS_TTL_MS, (accountId, bearer) =>
  fetchWorkerMetricsUncached(bearer, accountId),
);

/**
 * Per-account Worker metrics, cached briefly so tab refocus does not refire
 * the GraphQL query and re-render the whole list.
 */
export function fetchWorkerMetrics(
  bearer: string,
  accountId: string,
  options?: { force?: boolean },
): Promise<Map<string, WorkerMetrics>> {
  return workerMetricsCache.get(accountId, options, bearer);
}

/** Drops cached Worker metrics for one account, or every account when omitted. */
export function invalidateWorkerMetrics(accountId?: string): void {
  workerMetricsCache.invalidate(accountId);
}

const WORKER_HOURLY_QUERY = `query ($account: string, $script: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 200, filter: { datetime_geq: $since, scriptName: $script }) {
        sum { requests }
        dimensions { datetimeHour }
      }
    }
  }
}`;

/** Hourly request series for one Worker script over the last 24 hours. */
export async function fetchWorkerHourlySeries(
  bearer: string,
  accountId: string,
  scriptName: string,
): Promise<{ label: string; value: number }[]> {
  const accounts = await runAccountQuery<{
    workersInvocationsAdaptive?: {
      sum?: { requests?: number };
      dimensions?: { datetimeHour?: string };
    }[];
  }>(bearer, WORKER_HOURLY_QUERY, {
    account: accountId,
    script: scriptName,
    since: last24hIso(),
  });

  const byHour = new Map<string, number>();
  let sawData = false;
  for (const account of accounts) {
    for (const group of account.workersInvocationsAdaptive ?? []) {
      const hour = group.dimensions?.datetimeHour;
      if (!hour) {
        continue;
      }
      sawData = true;
      const key = hour.slice(0, 13);
      byHour.set(key, (byHour.get(key) ?? 0) + (group.sum?.requests ?? 0));
    }
  }

  return sawData ? fillHourlySeries(byHour) : [];
}

/** Pages Functions invocation totals and hourly series, last 24 hours. */
export interface PagesFunctionMetrics {
  requests: number;
  errors: number;
  series: { label: string; value: number }[];
}

const PAGES_FUNCTIONS_QUERY = `query ($account: string, $script: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      pagesFunctionsInvocationsAdaptiveGroups(limit: 200, filter: { datetime_geq: $since, scriptName: $script }) {
        sum { requests errors }
        dimensions { datetimeHour }
      }
    }
  }
}`;

export async function fetchPagesFunctionMetrics(
  bearer: string,
  accountId: string,
  scriptName: string,
): Promise<PagesFunctionMetrics> {
  const accounts = await runAccountQuery<{
    pagesFunctionsInvocationsAdaptiveGroups?: {
      sum?: { requests?: number; errors?: number };
      dimensions?: { datetimeHour?: string };
    }[];
  }>(bearer, PAGES_FUNCTIONS_QUERY, {
    account: accountId,
    script: scriptName,
    since: last24hIso(),
  });

  let requests = 0;
  let errors = 0;
  const byHour = new Map<string, number>();
  for (const account of accounts) {
    for (const group of account.pagesFunctionsInvocationsAdaptiveGroups ??
      []) {
      const groupRequests = group.sum?.requests ?? 0;
      requests += groupRequests;
      errors += group.sum?.errors ?? 0;
      const hour = group.dimensions?.datetimeHour;
      if (hour) {
        const key = hour.slice(0, 13);
        byHour.set(key, (byHour.get(key) ?? 0) + groupRequests);
      }
    }
  }

  return {
    requests,
    errors,
    series: byHour.size > 0 ? fillHourlySeries(byHour) : [],
  };
}

export interface R2BucketMetrics {
  objectCount: number;
  payloadSize: number;
  classAOps: number;
  classBOps: number;
}

export interface KvNamespaceMetrics {
  keyCount: number;
  byteCount: number;
  reads: number;
  writes: number;
}

export interface D1DatabaseMetrics {
  readQueries: number;
  writeQueries: number;
}

/** Metrics for every storage product of one account, keyed by resource id. */
export interface StorageMetrics {
  /** Keyed by bucket name. */
  r2: Map<string, R2BucketMetrics>;
  /** Keyed by namespace id. */
  kv: Map<string, KvNamespaceMetrics>;
  /** Keyed by database uuid. */
  d1: Map<string, D1DatabaseMetrics>;
}

const R2_STORAGE_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      r2StorageAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        max { objectCount payloadSize }
        dimensions { bucketName }
      }
    }
  }
}`;

const R2_OPS_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      r2OperationsAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        sum { requests }
        dimensions { bucketName actionType }
      }
    }
  }
}`;

const KV_STORAGE_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      kvStorageAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        max { keyCount byteCount }
        dimensions { namespaceId }
      }
    }
  }
}`;

const KV_OPS_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      kvOperationsAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        sum { requests }
        dimensions { namespaceId actionType }
      }
    }
  }
}`;

const D1_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      d1AnalyticsAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        sum { readQueries writeQueries }
        dimensions { databaseId }
      }
    }
  }
}`;

/** R2 billing classes: class A mutates/lists, everything else is class B. */
const R2_CLASS_A_ACTIONS = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
]);

/**
 * Storage metrics for one account over the last 24 hours. Every dataset is
 * fetched independently and failures simply leave that map empty, so plans
 * or tokens without a given product still render the rest.
 */
async function fetchStorageMetricsUncached(
  bearer: string,
  accountId: string,
): Promise<StorageMetrics> {
  const since = last24hIso();
  const variables = { account: accountId, since };
  const metrics: StorageMetrics = {
    r2: new Map(),
    kv: new Map(),
    d1: new Map(),
  };

  const r2Bucket = (name: string): R2BucketMetrics => {
    const existing = metrics.r2.get(name) ?? {
      objectCount: 0,
      payloadSize: 0,
      classAOps: 0,
      classBOps: 0,
    };
    metrics.r2.set(name, existing);
    return existing;
  };
  const kvNamespace = (id: string): KvNamespaceMetrics => {
    const existing = metrics.kv.get(id) ?? {
      keyCount: 0,
      byteCount: 0,
      reads: 0,
      writes: 0,
    };
    metrics.kv.set(id, existing);
    return existing;
  };

  await Promise.all([
    runAccountQuery<{
      r2StorageAdaptiveGroups?: {
        max?: { objectCount?: number; payloadSize?: number };
        dimensions?: { bucketName?: string };
      }[];
    }>(bearer, R2_STORAGE_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.r2StorageAdaptiveGroups ?? []) {
            const name = group.dimensions?.bucketName;
            if (!name) {
              continue;
            }
            const bucket = r2Bucket(name);
            bucket.objectCount = Math.max(
              bucket.objectCount,
              group.max?.objectCount ?? 0,
            );
            bucket.payloadSize = Math.max(
              bucket.payloadSize,
              group.max?.payloadSize ?? 0,
            );
          }
        }
      })
      .catch(() => {}),
    runAccountQuery<{
      r2OperationsAdaptiveGroups?: {
        sum?: { requests?: number };
        dimensions?: { bucketName?: string; actionType?: string };
      }[];
    }>(bearer, R2_OPS_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.r2OperationsAdaptiveGroups ?? []) {
            const name = group.dimensions?.bucketName;
            if (!name) {
              continue;
            }
            const bucket = r2Bucket(name);
            const requests = group.sum?.requests ?? 0;
            if (R2_CLASS_A_ACTIONS.has(group.dimensions?.actionType ?? '')) {
              bucket.classAOps += requests;
            } else {
              bucket.classBOps += requests;
            }
          }
        }
      })
      .catch(() => {}),
    runAccountQuery<{
      kvStorageAdaptiveGroups?: {
        max?: { keyCount?: number; byteCount?: number };
        dimensions?: { namespaceId?: string };
      }[];
    }>(bearer, KV_STORAGE_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.kvStorageAdaptiveGroups ?? []) {
            const id = group.dimensions?.namespaceId;
            if (!id) {
              continue;
            }
            const namespace = kvNamespace(id);
            namespace.keyCount = Math.max(
              namespace.keyCount,
              group.max?.keyCount ?? 0,
            );
            namespace.byteCount = Math.max(
              namespace.byteCount,
              group.max?.byteCount ?? 0,
            );
          }
        }
      })
      .catch(() => {}),
    runAccountQuery<{
      kvOperationsAdaptiveGroups?: {
        sum?: { requests?: number };
        dimensions?: { namespaceId?: string; actionType?: string };
      }[];
    }>(bearer, KV_OPS_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.kvOperationsAdaptiveGroups ?? []) {
            const id = group.dimensions?.namespaceId;
            if (!id) {
              continue;
            }
            const namespace = kvNamespace(id);
            const requests = group.sum?.requests ?? 0;
            if (group.dimensions?.actionType === 'read') {
              namespace.reads += requests;
            } else {
              namespace.writes += requests;
            }
          }
        }
      })
      .catch(() => {}),
    runAccountQuery<{
      d1AnalyticsAdaptiveGroups?: {
        sum?: { readQueries?: number; writeQueries?: number };
        dimensions?: { databaseId?: string };
      }[];
    }>(bearer, D1_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.d1AnalyticsAdaptiveGroups ?? []) {
            const id = group.dimensions?.databaseId;
            if (!id) {
              continue;
            }
            const existing = metrics.d1.get(id) ?? {
              readQueries: 0,
              writeQueries: 0,
            };
            existing.readQueries += group.sum?.readQueries ?? 0;
            existing.writeQueries += group.sum?.writeQueries ?? 0;
            metrics.d1.set(id, existing);
          }
        }
      })
      .catch(() => {}),
  ]);

  return metrics;
}

const storageMetricsCache = createKeyedTtlCache<StorageMetrics, string, [string]>(
  METRICS_TTL_MS,
  (accountId, bearer) => fetchStorageMetricsUncached(bearer, accountId),
);

/** Per-account storage metrics with the same short cache as Worker metrics. */
export function fetchStorageMetrics(
  bearer: string,
  accountId: string,
  options?: { force?: boolean },
): Promise<StorageMetrics> {
  return storageMetricsCache.get(accountId, options, bearer);
}

/** Drops cached storage metrics for one account, or every account when omitted. */
export function invalidateStorageMetrics(accountId?: string): void {
  storageMetricsCache.invalidate(accountId);
}
