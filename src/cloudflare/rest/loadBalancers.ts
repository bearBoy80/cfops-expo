import { request } from './client';

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
