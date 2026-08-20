import { CloudflareApiError, request } from './client';

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
