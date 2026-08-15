import {
  CloudflareApiError,
  listAlertHistory,
  listAuditLogs,
  listLoadBalancerPools,
  listLoadBalancers,
  listSubscriptions,
  listZoneLoadBalancers,
  type CfAlert,
  type CfAuditEntry,
  type CfLoadBalancer,
  type CfLoadBalancerPool,
  type CfSubscription,
} from './api';
import {
  resolveAccounts,
  type AccountScope,
} from './accountResources';
import { fetchZonesSnapshot, type ConnectionIssue } from './resources';

export interface AlertItem extends CfAlert, AccountScope {}
export interface LoadBalancerItem extends CfLoadBalancer, AccountScope {
  pools: CfLoadBalancerPool[];
}
export interface AuditItem extends CfAuditEntry, AccountScope {}
export interface SubscriptionItem extends CfSubscription, AccountScope {}

export interface AlertsSnapshot {
  alerts: AlertItem[];
  issues: ConnectionIssue[];
}

export interface LoadBalancingSnapshot {
  balancers: LoadBalancerItem[];
  issues: ConnectionIssue[];
}

export interface AuditSnapshot {
  entries: AuditItem[];
  issues: ConnectionIssue[];
}

export interface BillingSnapshot {
  subscriptions: SubscriptionItem[];
  issues: ConnectionIssue[];
}

function inScope(accountId: string | undefined, item: AccountScope): boolean {
  return !accountId || item.accountId === accountId;
}

export async function fetchAlertsSnapshot(
  accountId?: string,
): Promise<AlertsSnapshot> {
  const { accounts, issues } = await resolveAccounts();
  const alerts: AlertItem[] = [];

  await Promise.all(
    accounts
      .filter((account) => inScope(accountId, account))
      .map(async (account) => {
        try {
          const items = await listAlertHistory(account.bearer, account.accountId);
          alerts.push(
            ...items.map((item) => ({
              ...item,
              accountId: account.accountId,
              accountName: account.accountName,
              connectionId: account.connectionId,
            })),
          );
        } catch (cause) {
          if (__DEV__) {
            console.warn('[alerts]', account.accountName, cause);
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
      }),
  );

  alerts.sort((a, b) => (b.sent || '').localeCompare(a.sent || ''));
  return { alerts, issues };
}

export async function fetchLoadBalancingSnapshot(
  accountId?: string,
): Promise<LoadBalancingSnapshot> {
  const { accounts, issues } = await resolveAccounts();
  const balancers: LoadBalancerItem[] = [];

  await Promise.all(
    accounts
      .filter((account) => inScope(accountId, account))
      .map(async (account) => {
        try {
          let lbs: CfLoadBalancer[] = [];
          try {
            lbs = await listLoadBalancers(account.bearer, account.accountId);
          } catch (cause) {
            if (
              !(cause instanceof CloudflareApiError) ||
              cause.code !== 'forbidden'
            ) {
              throw cause;
            }
            const zones = await fetchZonesSnapshot();
            const accountZones = zones.zones.filter(
              (zone) => zone.accountId === account.accountId,
            );
            const perZone = await Promise.all(
              accountZones.map(async (zone) => {
                try {
                  return {
                    ok: true as const,
                    items: await listZoneLoadBalancers(account.bearer, zone.id),
                  };
                } catch (cause) {
                  return { ok: false as const, cause };
                }
              }),
            );
            const byId = new Map<string, CfLoadBalancer>();
            for (const result of perZone) {
              if (result.ok) {
                for (const item of result.items) {
                  byId.set(item.id, item);
                }
              }
            }
            lbs = [...byId.values()];
            if (
              lbs.length === 0 &&
              accountZones.length > 0 &&
              perZone.every((result) => !result.ok)
            ) {
              throw perZone[0]?.cause ?? new CloudflareApiError('forbidden');
            }
          }
          const pools = await listLoadBalancerPools(
            account.bearer,
            account.accountId,
          ).catch(() => [] as CfLoadBalancerPool[]);
          const poolsById = new Map(pools.map((pool) => [pool.id, pool]));
          for (const lb of lbs) {
            balancers.push({
              ...lb,
              accountId: account.accountId,
              accountName: account.accountName,
              connectionId: account.connectionId,
              pools: lb.poolIds
                .map((id) => poolsById.get(id))
                .filter((pool): pool is CfLoadBalancerPool => Boolean(pool)),
            });
          }
        } catch (cause) {
          issues.push({
            connectionId: account.connectionId,
            label: account.accountName,
            cause:
              cause instanceof CloudflareApiError
                ? cause
                : new CloudflareApiError('api'),
          });
        }
      }),
  );

  balancers.sort((a, b) => a.name.localeCompare(b.name));
  return { balancers, issues };
}

export async function fetchAuditSnapshot(
  accountId?: string,
): Promise<AuditSnapshot> {
  const { accounts, issues } = await resolveAccounts();
  const entries: AuditItem[] = [];

  await Promise.all(
    accounts
      .filter((account) => inScope(accountId, account))
      .map(async (account) => {
        try {
          const items = await listAuditLogs(account.bearer, account.accountId);
          entries.push(
            ...items.map((item) => ({
              ...item,
              accountId: account.accountId,
              accountName: account.accountName,
              connectionId: account.connectionId,
            })),
          );
        } catch (cause) {
          if (__DEV__) {
            console.warn('[audit]', account.accountName, cause);
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
      }),
  );

  entries.sort((a, b) => (b.when || '').localeCompare(a.when || ''));
  return { entries, issues };
}

export async function fetchBillingSnapshot(
  accountId?: string,
): Promise<BillingSnapshot> {
  const { accounts, issues } = await resolveAccounts();
  const subscriptions: SubscriptionItem[] = [];

  await Promise.all(
    accounts
      .filter((account) => inScope(accountId, account))
      .map(async (account) => {
        try {
          const items = await listSubscriptions(
            account.bearer,
            account.accountId,
          );
          subscriptions.push(
            ...items.map((item) => ({
              ...item,
              accountId: account.accountId,
              accountName: account.accountName,
              connectionId: account.connectionId,
            })),
          );
        } catch (cause) {
          issues.push({
            connectionId: account.connectionId,
            label: account.accountName,
            cause:
              cause instanceof CloudflareApiError
                ? cause
                : new CloudflareApiError('api'),
          });
        }
      }),
  );

  subscriptions.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
  return { subscriptions, issues };
}

export interface GroupedSubscription extends SubscriptionItem {
  count: number;
}

/** Collapse identical rate plans so zone-scoped Free/R2 rows do not repeat. */
export function groupSubscriptions(
  items: SubscriptionItem[],
): GroupedSubscription[] {
  const groups = new Map<string, GroupedSubscription>();
  for (const item of items) {
    const key = [item.accountId, item.name, item.price].join('|');
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    groups.set(key, { ...item, count: 1 });
  }
  return [...groups.values()].sort(
    (a, b) => b.price - a.price || a.name.localeCompare(b.name),
  );
}

export function alertStatus(type: string): 'error' | 'degraded' | 'log' {
  const value = type.toLowerCase();
  if (/ddos|dos_attack|anomaly|spike|error|outage|unhealthy/.test(value)) {
    return 'error';
  }
  if (/ssl|cert|expir|billing|usage|health/.test(value)) {
    return 'degraded';
  }
  return 'log';
}

export function balancerStatus(
  balancer: LoadBalancerItem,
): 'healthy' | 'degraded' | 'paused' {
  if (!balancer.enabled) {
    return 'paused';
  }
  if (balancer.pools.some((pool) => !pool.enabled || pool.originEnabled === 0)) {
    return 'degraded';
  }
  return 'healthy';
}

export function poolStatus(
  pool: CfLoadBalancerPool,
): 'healthy' | 'degraded' | 'error' {
  if (!pool.enabled || pool.originEnabled === 0) {
    return 'error';
  }
  if (pool.originEnabled < pool.originCount) {
    return 'degraded';
  }
  return 'healthy';
}
