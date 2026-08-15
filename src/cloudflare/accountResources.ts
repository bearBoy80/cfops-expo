import {
  CloudflareApiError,
  getD1Database,
  listAccounts,
  listD1Databases,
  listKvNamespaces,
  listPagesProjects,
  listR2Buckets,
  listWorkerScripts,
  type CfD1Database,
  type CfKvNamespace,
  type CfPagesProject,
  type CfR2Bucket,
  type CfWorkerScript,
} from './api';
import { listConnections } from './connections';
import { getConnectionBearer, type ConnectionIssue } from './resources';

/** Ownership metadata attached to every account-scoped resource. */
export interface AccountScope {
  accountId: string;
  accountName: string;
  connectionId: string;
}

export interface R2BucketItem extends CfR2Bucket, AccountScope {}
export interface KvNamespaceItem extends CfKvNamespace, AccountScope {}
export interface D1DatabaseItem extends CfD1Database, AccountScope {}
export interface WorkerItem extends CfWorkerScript, AccountScope {}
export interface PagesProjectItem extends CfPagesProject, AccountScope {}

export interface StorageSnapshot {
  connectionCount: number;
  /** Every reachable account, including ones without storage resources. */
  accounts: AccountScope[];
  buckets: R2BucketItem[];
  kvNamespaces: KvNamespaceItem[];
  d1Databases: D1DatabaseItem[];
  issues: ConnectionIssue[];
}

export interface ComputeSnapshot {
  connectionCount: number;
  accounts: AccountScope[];
  workers: WorkerItem[];
  pages: PagesProjectItem[];
  issues: ConnectionIssue[];
}

export interface ResolvedAccount extends AccountScope {
  bearer: string;
}

/**
 * One bearer per distinct account: the same account can be reachable through
 * several credentials, and account-level data would only be duplicated.
 */
export async function resolveAccounts(): Promise<{
  connectionCount: number;
  accounts: ResolvedAccount[];
  issues: ConnectionIssue[];
}> {
  const connections = await listConnections();
  const issues: ConnectionIssue[] = [];
  const byAccount = new Map<string, ResolvedAccount>();

  await Promise.all(
    connections.map(async (connection) => {
      try {
        const bearer = await getConnectionBearer(connection);
        if (!bearer) {
          throw new CloudflareApiError('missing-credential');
        }
        // Older connections may have been stored without their account list
        // (e.g. tokens that could not list accounts at connect time), so
        // re-discover live before giving up.
        const accounts =
          connection.accounts.length > 0
            ? connection.accounts
            : await listAccounts(bearer);
        for (const account of accounts) {
          if (!byAccount.has(account.id)) {
            byAccount.set(account.id, {
              accountId: account.id,
              accountName: account.name,
              connectionId: connection.id,
              bearer,
            });
          }
        }
      } catch (cause) {
        if (__DEV__) {
          console.warn(
            `[accountResources] connection ${connection.label} failed:`,
            cause,
          );
        }
        issues.push({
          connectionId: connection.id,
          label: connection.label,
          cause:
            cause instanceof CloudflareApiError
              ? cause
              : new CloudflareApiError('api'),
        });
      }
    }),
  );

  return {
    connectionCount: connections.length,
    accounts: [...byAccount.values()].sort((a, b) =>
      a.accountName.localeCompare(b.accountName),
    ),
    issues,
  };
}

/** Records at most one issue per account so missing scopes stay readable. */
function pushIssue(
  issues: ConnectionIssue[],
  account: ResolvedAccount,
  cause: unknown,
): void {
  if (__DEV__) {
    console.warn(
      `[accountResources] ${account.accountName} fetch failed:`,
      cause,
    );
  }
  if (issues.some((issue) => issue.label === account.accountName)) {
    return;
  }
  issues.push({
    connectionId: account.connectionId,
    label: account.accountName,
    cause:
      cause instanceof CloudflareApiError
        ? cause
        : new CloudflareApiError('api'),
  });
}

const D1_DETAIL_LIMIT = 10;

async function fetchStorage(): Promise<StorageSnapshot> {
  const { connectionCount, accounts, issues } = await resolveAccounts();
  const buckets: R2BucketItem[] = [];
  const kvNamespaces: KvNamespaceItem[] = [];
  const d1Databases: D1DatabaseItem[] = [];

  await Promise.all(
    accounts.map(async (account) => {
      const scope = {
        accountId: account.accountId,
        accountName: account.accountName,
        connectionId: account.connectionId,
      };
      await Promise.all([
        listR2Buckets(account.bearer, account.accountId)
          .then((items) =>
            buckets.push(...items.map((item) => ({ ...item, ...scope }))),
          )
          .catch((cause) => pushIssue(issues, account, cause)),
        listKvNamespaces(account.bearer, account.accountId)
          .then((items) =>
            kvNamespaces.push(...items.map((item) => ({ ...item, ...scope }))),
          )
          .catch((cause) => pushIssue(issues, account, cause)),
        listD1Databases(account.bearer, account.accountId)
          .then(async (items) => {
            // The list response may omit size/tables; backfill a few details.
            const detailed = await Promise.all(
              items.map(async (item, index) => {
                if (item.fileSize !== null || index >= D1_DETAIL_LIMIT) {
                  return item;
                }
                return getD1Database(
                  account.bearer,
                  account.accountId,
                  item.uuid,
                ).catch(() => item);
              }),
            );
            d1Databases.push(
              ...detailed.map((item) => ({ ...item, ...scope })),
            );
          })
          .catch((cause) => pushIssue(issues, account, cause)),
      ]);
    }),
  );

  const byName = <T extends { name: string }>(a: T, b: T) =>
    a.name.localeCompare(b.name);
  buckets.sort(byName);
  kvNamespaces.sort((a, b) => a.title.localeCompare(b.title));
  d1Databases.sort(byName);

  return {
    connectionCount,
    accounts: accounts.map(({ accountId, accountName, connectionId }) => ({
      accountId,
      accountName,
      connectionId,
    })),
    buckets,
    kvNamespaces,
    d1Databases,
    issues,
  };
}

async function fetchCompute(): Promise<ComputeSnapshot> {
  const { connectionCount, accounts, issues } = await resolveAccounts();
  const workers: WorkerItem[] = [];
  const pages: PagesProjectItem[] = [];

  await Promise.all(
    accounts.map(async (account) => {
      const scope = {
        accountId: account.accountId,
        accountName: account.accountName,
        connectionId: account.connectionId,
      };
      await Promise.all([
        listWorkerScripts(account.bearer, account.accountId)
          .then((items) =>
            workers.push(...items.map((item) => ({ ...item, ...scope }))),
          )
          .catch((cause) => pushIssue(issues, account, cause)),
        listPagesProjects(account.bearer, account.accountId)
          .then((items) =>
            pages.push(...items.map((item) => ({ ...item, ...scope }))),
          )
          .catch((cause) => pushIssue(issues, account, cause)),
      ]);
    }),
  );

  workers.sort((a, b) => a.id.localeCompare(b.id));
  pages.sort((a, b) => a.name.localeCompare(b.name));

  return {
    connectionCount,
    accounts: accounts.map(({ accountId, accountName, connectionId }) => ({
      accountId,
      accountName,
      connectionId,
    })),
    workers,
    pages,
    issues,
  };
}

const SNAPSHOT_TTL_MS = 30_000;

let storageCache: { at: number; promise: Promise<StorageSnapshot> } | null =
  null;
let computeCache: { at: number; promise: Promise<ComputeSnapshot> } | null =
  null;

export function fetchStorageSnapshot(options?: {
  force?: boolean;
}): Promise<StorageSnapshot> {
  const now = Date.now();
  if (!options?.force && storageCache && now - storageCache.at < SNAPSHOT_TTL_MS) {
    return storageCache.promise;
  }
  const promise = fetchStorage();
  storageCache = { at: now, promise };
  promise.catch(() => {
    if (storageCache?.promise === promise) {
      storageCache = null;
    }
  });
  return promise;
}

export function fetchComputeSnapshot(options?: {
  force?: boolean;
}): Promise<ComputeSnapshot> {
  const now = Date.now();
  if (!options?.force && computeCache && now - computeCache.at < SNAPSHOT_TTL_MS) {
    return computeCache.promise;
  }
  const promise = fetchCompute();
  computeCache = { at: now, promise };
  promise.catch(() => {
    if (computeCache?.promise === promise) {
      computeCache = null;
    }
  });
  return promise;
}

export function invalidateStorageSnapshot(): void {
  storageCache = null;
}

export function invalidateComputeSnapshot(): void {
  computeCache = null;
}
