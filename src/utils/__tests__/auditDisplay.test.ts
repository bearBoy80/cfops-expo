import type { CfAuditEntry } from '../../cloudflare/api';
import {
  countAuditFilters,
  formatAuditTitle,
  groupAuditByDay,
  humanizeSlug,
  isAuditChange,
  matchesAuditFilter,
} from '../auditDisplay';

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === 'audit.kind.create') {
    return `Created ${options?.resource ?? ''}`;
  }
  if (key === 'audit.kind.update') {
    return `Updated ${options?.resource ?? ''}`;
  }
  if (key === 'audit.resource.dns_record') {
    return 'DNS record';
  }
  if (key === 'audit.resource.zone') {
    return 'zone';
  }
  if (key === 'audit.today') {
    return 'Today';
  }
  if (key === 'audit.yesterday') {
    return 'Yesterday';
  }
  return key;
};

const entry = (
  overrides: Partial<CfAuditEntry> = {},
): CfAuditEntry => ({
  id: 'a-1',
  action: 'dns_record.create',
  actionKind: 'create',
  result: 'success',
  resource: 'dns_record',
  resourceId: '',
  zone: '',
  actor: 'sarah@acme.com',
  actorKind: 'user',
  ip: '1.1.1.1',
  when: '2026-08-14T16:38:00Z',
  ...overrides,
});

test('humanizes slugs', () => {
  expect(humanizeSlug('dns_record.create')).toBe('Dns Record Create');
});

test('composes a title from action kind and resource', () => {
  expect(formatAuditTitle(entry(), t)).toBe('Created DNS record');
});

test('keeps a human description from the API', () => {
  expect(
    formatAuditTitle(entry({ action: 'Add Member', actionKind: 'create' }), t),
  ).toBe('Add Member');
});

test('identifies mutating actions', () => {
  expect(isAuditChange('create')).toBe(true);
  expect(isAuditChange('view')).toBe(false);
});

test('treats Update Token noise as other, not a resource change', () => {
  const token = entry({
    action: 'Update Token',
    actionKind: 'update',
    resource: 'token',
  });
  const dns = entry();
  expect(matchesAuditFilter(token, 'changes')).toBe(false);
  expect(matchesAuditFilter(token, 'other')).toBe(true);
  expect(matchesAuditFilter(dns, 'changes')).toBe(true);
  expect(countAuditFilters([token, token, dns])).toEqual({
    all: 3,
    changes: 1,
    other: 2,
  });
});

test('groups entries by local day', () => {
  const now = new Date('2026-08-14T18:00:00').getTime();
  const groups = groupAuditByDay(
    [
      entry({ id: 'today', when: '2026-08-14T16:38:00' }),
      entry({ id: 'yesterday', when: '2026-08-13T09:00:00' }),
    ],
    t,
    now,
  );
  expect(groups.map((group) => group.label)).toEqual(['Today', 'Yesterday']);
});
