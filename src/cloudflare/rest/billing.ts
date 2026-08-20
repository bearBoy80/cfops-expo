import { request } from './client';

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
