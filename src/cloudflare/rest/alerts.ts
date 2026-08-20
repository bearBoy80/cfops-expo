import { CloudflareApiError, request } from './client';

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
