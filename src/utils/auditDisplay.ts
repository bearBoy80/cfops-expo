import type { AuditActionKind, CfAuditEntry } from '../cloudflare/api';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const RESOURCE_KEYS: Record<string, string> = {
  dns_record: 'audit.resource.dns_record',
  zone: 'audit.resource.zone',
  worker: 'audit.resource.worker',
  workers_script: 'audit.resource.worker',
  member: 'audit.resource.member',
  account: 'audit.resource.account',
  load_balancer: 'audit.resource.load_balancer',
  firewall: 'audit.resource.firewall',
  token: 'audit.resource.token',
  user: 'audit.resource.user',
};

export function humanizeSlug(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resourceLabel(resource: string, t: Translate): string {
  const slug = resource.trim().toLowerCase();
  const key = RESOURCE_KEYS[slug];
  if (key) {
    return t(key);
  }
  return humanizeSlug(resource);
}

/** Prefer a human description; otherwise "Created DNS record". */
export function formatAuditTitle(entry: CfAuditEntry, t: Translate): string {
  const raw = entry.action.trim();
  const looksComposed = /^[a-z0-9]+([._][a-z0-9]+)+$/i.test(raw);
  if (raw && raw !== 'action' && !looksComposed) {
    return /[_\.]/.test(raw) ? humanizeSlug(raw) : raw;
  }
  const resource = resourceLabel(entry.resource || raw.split(/[._]/)[0] || '', t);
  if (entry.actionKind !== 'other' && resource) {
    return t(`audit.kind.${entry.actionKind}`, { resource });
  }
  return resource || humanizeSlug(raw) || t('audit.kind.other');
}

export function isAuditChange(kind: AuditActionKind): boolean {
  return kind === 'create' || kind === 'update' || kind === 'delete';
}

export type AuditFilter = 'all' | 'changes' | 'other';

/** Token/API bookkeeping is not a resource change (e.g. 100× "Update Token"). */
export function isTokenActivity(
  entry: Pick<CfAuditEntry, 'action' | 'resource'>,
): boolean {
  const haystack = `${entry.resource} ${entry.action}`.toLowerCase();
  return /\btoken\b/.test(haystack);
}

export function matchesAuditFilter(
  entry: Pick<CfAuditEntry, 'action' | 'actionKind' | 'resource'>,
  filter: AuditFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }
  const change = isAuditChange(entry.actionKind) && !isTokenActivity(entry);
  return filter === 'changes' ? change : !change;
}

export function countAuditFilters(
  entries: Array<Pick<CfAuditEntry, 'action' | 'actionKind' | 'resource'>>,
): Record<AuditFilter, number> {
  let changes = 0;
  for (const entry of entries) {
    if (matchesAuditFilter(entry, 'changes')) {
      changes += 1;
    }
  }
  return {
    all: entries.length,
    changes,
    other: entries.length - changes,
  };
}

export function localDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDayKeyFromMs(at: number): string {
  const date = new Date(at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function groupAuditByDay<T extends { when: string }>(
  items: T[],
  t: Translate,
  now = Date.now(),
): { key: string; label: string; items: T[] }[] {
  const today = localDayKeyFromMs(now);
  const yesterday = localDayKeyFromMs(now - 24 * 60 * 60 * 1000);
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = localDayKey(item.when) || 'unknown';
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  }
  return [...groups.entries()].map(([key, groupItems]) => ({
    key,
    items: groupItems,
    label:
      key === today
        ? t('audit.today')
        : key === yesterday
          ? t('audit.yesterday')
          : key === 'unknown'
            ? t('audit.sectionActivity')
            : key,
  }));
}
