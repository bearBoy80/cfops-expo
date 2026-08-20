import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDownToLine, ArrowUpFromLine, Database } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  deleteD1Database,
  getD1Database,
  listD1Tables,
  type CfD1Database,
} from '@/src/cloudflare/api';
import { invalidateStorageSnapshot } from '@/src/cloudflare/accountResources';
import {
  fetchStorageMetrics,
  invalidateStorageMetrics,
  type D1DatabaseMetrics,
} from '@/src/cloudflare/analytics';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  Card,
  ListRow,
  MetricTile,
  SectionLabel,
  showActionMenu,
  useToast,
  InlineEmpty,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label } from '@/src/theme/tokens';
import { compactNumber, formatBytes, relativeTime } from '@/src/utils/format';

export default function D1DatabaseDetail() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    database: string;
    accountId: string;
    connectionId: string;
    accountName?: string;
    name?: string;
    createdAt?: string;
    version?: string;
  }>();
  const [detail, setDetail] = useState<CfD1Database | null>(null);
  const [tables, setTables] = useState<string[] | null>(null);
  const [metrics, setMetrics] = useState<D1DatabaseMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const bearer = await getBearerForConnection(params.connectionId);
      await Promise.all([
        getD1Database(bearer, params.accountId, params.database)
          .then((next) => {
            setDetail(next);
          })
          .catch(() => {}),
        listD1Tables(bearer, params.accountId, params.database)
          .then((names) => {
            setTables(names);
          })
          .catch(() => {
            setTables([]);
          }),
        fetchStorageMetrics(bearer, params.accountId)
          .then((accountMetrics) => {
            setMetrics(accountMetrics.d1.get(params.database) ?? null);
          })
          .catch(() => {}),
      ]);
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [params.accountId, params.connectionId, params.database]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = useCallback(() => {
    if (busy) {
      return;
    }
    showActionMenu({
      title: t('storage.deleteDatabase'),
      message: t('storage.deleteDatabaseConfirm', {
        name: params.name ?? params.database,
      }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.deleteDatabase'),
          destructive: true,
          onPress: () => {
            setBusy(true);
            void getBearerForConnection(params.connectionId)
              .then((bearer) =>
                deleteD1Database(bearer, params.accountId, params.database),
              )
              .then(() => {
                invalidateStorageSnapshot();
                invalidateStorageMetrics(params.accountId);
                showToast(t('storage.databaseDeleted'));
                router.back();
              })
              .catch((cause) => {
                showToast(cloudflareErrorMessage(cause), 'error');
              })
              .finally(() => setBusy(false));
          },
        },
      ],
    });
  }, [
    busy,
    params.accountId,
    params.connectionId,
    params.database,
    params.name,
    router,
    showToast,
    t,
  ]);

  const createdAt = detail?.createdAt ?? params.createdAt;
  const version = detail?.version || params.version;
  const tableCount =
    detail?.numTables != null || tables != null
      ? Math.max(detail?.numTables ?? 0, tables?.length ?? 0)
      : null;

  return (
    <ZoneSubpage
      backLabel={t('storage.title')}
      error={error}
      loading={loading}
      onRefresh={load}
      subtitle={params.accountName}
      title={params.name ?? params.database}
    >
      <View style={styles.tileRow}>
        <MetricTile
          Icon={Database}
          color={accent.purple}
          label={t('storage.stored')}
          value={
            detail?.fileSize != null ? formatBytes(detail.fileSize) : '—'
          }
        />
        <MetricTile
          Icon={Database}
          color={accent.blue}
          label={t('storage.sectionTables')}
          value={tableCount != null ? compactNumber(tableCount) : '—'}
        />
      </View>
      <View style={styles.tileRow}>
        <MetricTile
          Icon={ArrowDownToLine}
          color={accent.green}
          label={t('storage.readsLabel')}
          sub={t('storage.last24h')}
          value={metrics ? compactNumber(metrics.readQueries) : '—'}
        />
        <MetricTile
          Icon={ArrowUpFromLine}
          color={accent.purple}
          label={t('storage.writesLabel')}
          sub={t('storage.last24h')}
          value={metrics ? compactNumber(metrics.writeQueries) : '—'}
        />
      </View>

      <SectionLabel>{t('storage.sectionDetails')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          left={
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t('storage.account')}
            </Text>
          }
          right={
            <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
              {params.accountName ?? '—'}
            </Text>
          }
        />
        <ListRow
          chevron={false}
          left={
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t('storage.version')}
            </Text>
          }
          right={
            <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
              {version || '—'}
            </Text>
          }
        />
        <ListRow
          chevron={false}
          last
          left={
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t('storage.createdAt')}
            </Text>
          }
          right={
            <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
              {createdAt ? relativeTime(createdAt, t) : '—'}
            </Text>
          }
        />
      </Card>

      <SectionLabel>{t('storage.sectionTables')}</SectionLabel>
      {tables && tables.length > 0 ? (
        <Card>
          {tables.map((name, index) => (
            <ListRow
              key={name}
              chevron={false}
              last={index === tables.length - 1}
              testID={`d1-table-${name}`}
              left={
                <Text
                  numberOfLines={1}
                  style={[styles.mono, { color: colors.text }]}
                >
                  {name}
                </Text>
              }
            />
          ))}
        </Card>
      ) : (
        <InlineEmpty>
          {t('storage.noTables')}
        </InlineEmpty>
      )}

      <SectionLabel>{t('storage.sectionActions')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          last
          onPress={busy ? undefined : confirmDelete}
          testID="d1-delete-database"
          left={
            <Text style={styles.deleteLabel}>
              {t('storage.deleteDatabase')}
            </Text>
          }
        />
      </Card>
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  deleteLabel: {
    color: accent.red,
    fontSize: 17,
  },
  mono: {
    fontFamily: 'Menlo',
    fontSize: 13,
  },
  rowLabel: {
    fontSize: 17,
  },
  rowValue: {
    fontSize: 15,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
  },
});
