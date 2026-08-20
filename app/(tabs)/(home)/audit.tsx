import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AuditActionKind } from '@/src/cloudflare/api';
import {
  fetchAuditSnapshot,
  type AuditSnapshot,
} from '@/src/cloudflare/management';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  Card,
  ListRow,
  Pill,
  SectionLabel,
  SegmentedControl,
  InlineEmpty,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, label, tint } from '@/src/theme/tokens';
import {
  countAuditFilters,
  formatAuditTitle,
  groupAuditByDay,
  matchesAuditFilter,
  type AuditFilter,
} from '@/src/utils/auditDisplay';
import { formatClock, relativeTime } from '@/src/utils/format';

function actionColor(kind: AuditActionKind, failed: boolean): string {
  if (failed) {
    return accent.red;
  }
  if (kind === 'create') {
    return accent.green;
  }
  if (kind === 'delete') {
    return accent.red;
  }
  if (kind === 'view') {
    return accent.blue;
  }
  if (kind === 'update') {
    return accent.orange;
  }
  return accent.gray;
}

function actionMark(kind: AuditActionKind): string {
  if (kind === 'create') {
    return '+';
  }
  if (kind === 'delete') {
    return '–';
  }
  if (kind === 'view') {
    return 'i';
  }
  if (kind === 'update') {
    return '✎';
  }
  return '•';
}

export default function HomeAudit() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    accountId?: string;
    accountName?: string;
  }>();
  const [snapshot, setSnapshot] = useState<AuditSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditFilter>('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchAuditSnapshot(params.accountId || undefined);
      setSnapshot(next);
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    }
  }, [params.accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const missingPermission =
    !!snapshot &&
    snapshot.entries.length === 0 &&
    snapshot.issues.some((issue) => issue.cause.code === 'forbidden');
  const pageError =
    error ??
    (snapshot &&
    snapshot.entries.length === 0 &&
    snapshot.issues[0] &&
    !missingPermission
      ? cloudflareErrorMessage(snapshot.issues[0].cause)
      : null);

  const entries = snapshot?.entries ?? [];
  const counts = useMemo(() => countAuditFilters(entries), [entries]);
  const visible = useMemo(
    () => entries.filter((item) => matchesAuditFilter(item, filter)),
    [entries, filter],
  );

  const groups = useMemo(
    () => groupAuditByDay(visible, t),
    [t, visible],
  );

  const scopedName = Array.isArray(params.accountName)
    ? params.accountName[0]
    : params.accountName;

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={pageError}
      loading={!snapshot && !error}
      onRefresh={load}
      subtitle={
        scopedName
          ? scopedName
          : snapshot
            ? t(`audit.subtitleByFilter.${filter}`, { count: visible.length })
            : t('audit.subtitle')
      }
      title={t('home.mgmtAudit')}
    >
      {snapshot && snapshot.entries.length > 0 ? (
        <View style={styles.filter}>
          <SegmentedControl
            onChange={setFilter}
            segments={[
              { id: 'all', label: t('audit.filterAll', { count: counts.all }) },
              {
                id: 'changes',
                label: t('audit.filterChanges', { count: counts.changes }),
              },
              {
                id: 'other',
                label: t('audit.filterOther', { count: counts.other }),
              },
            ]}
            selected={filter}
            testIDPrefix="audit-filter"
          />
        </View>
      ) : null}

      {snapshot && snapshot.entries.length === 0 ? (
        <InlineEmpty>
          {t(missingPermission ? 'audit.permissionHint' : 'audit.empty')}
        </InlineEmpty>
      ) : visible.length === 0 ? (
        <InlineEmpty>
          {t(filter === 'changes' ? 'audit.emptyChanges' : 'audit.emptyFilter')}
        </InlineEmpty>
      ) : (
        groups.map((group) => (
          <View key={group.key}>
            <SectionLabel>{group.label}</SectionLabel>
            <Card>
              {group.items.map((item, index) => {
                const failed = item.result === 'failure';
                const color = actionColor(item.actionKind, failed);
                const title = formatAuditTitle(item, t);
                const detail = [item.zone, item.resourceId]
                  .filter(Boolean)
                  .join(' · ');
                const meta = [
                  item.ip,
                  item.when ? formatClock(item.when) : null,
                  item.when ? relativeTime(item.when, t) : null,
                  scopedName ? null : item.accountName,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <ListRow
                    chevron={false}
                    key={`${item.id}-${index}`}
                    last={index === group.items.length - 1}
                    left={
                      <View style={styles.row}>
                        <View
                          style={[
                            styles.icon,
                            { backgroundColor: tint(color, '22') },
                          ]}
                        >
                          <Text style={[styles.mark, { color }]}>
                            {actionMark(item.actionKind)}
                          </Text>
                        </View>
                        <View style={styles.copy}>
                          <View style={styles.titleRow}>
                            <Text
                              numberOfLines={2}
                              style={[styles.title, { color: colors.text }]}
                            >
                              {title}
                            </Text>
                            {failed ? <Pill status="error" /> : null}
                          </View>
                          {detail ? (
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.detail,
                                { color: label(mode, 0.4) },
                              ]}
                            >
                              {detail}
                            </Text>
                          ) : null}
                          <Text
                            numberOfLines={1}
                            style={[styles.meta, { color: label(mode, 0.4) }]}
                          >
                            <Text style={{ color: accent.orange }}>
                              {item.actor}
                            </Text>
                            {meta ? ` · ${meta}` : ''}
                          </Text>
                        </View>
                      </View>
                    }
                  />
                );
              })}
            </Card>
          </View>
        ))
      )}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    minWidth: 0,
  },
  detail: {
    ...fontFace('footnote'),
    marginTop: 3,
  },
  filter: {
    marginTop: 16,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  mark: {
    ...fontFace('body', '700'),
  },
  meta: {
    ...fontFace('caption'),
    marginTop: 4,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  title: {
    ...fontFace('body', '500'),
    flexShrink: 1,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
