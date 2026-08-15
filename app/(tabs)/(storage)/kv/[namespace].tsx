import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDownToLine, ArrowUpFromLine, KeyRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  deleteKvNamespace,
  listKvKeys,
  type CfKvKey,
} from '@/src/cloudflare/api';
import { invalidateStorageSnapshot } from '@/src/cloudflare/accountResources';
import {
  fetchStorageMetrics,
  type KvNamespaceMetrics,
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
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label } from '@/src/theme/tokens';
import { compactNumber, formatBytes } from '@/src/utils/format';

export default function KvNamespaceDetail() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    namespace: string;
    accountId: string;
    connectionId: string;
    accountName?: string;
    title?: string;
  }>();
  const [keys, setKeys] = useState<CfKvKey[] | null>(null);
  const [metrics, setMetrics] = useState<KvNamespaceMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getBearerForConnection(params.connectionId)
      .then(async (bearer) => {
        await Promise.all([
          listKvKeys(bearer, params.accountId, params.namespace)
            .then((items) => {
              if (active) {
                setKeys(items);
              }
            })
            .catch(() => {
              if (active) {
                setKeys([]);
              }
            }),
          fetchStorageMetrics(bearer, params.accountId)
            .then((accountMetrics) => {
              if (active) {
                setMetrics(accountMetrics.kv.get(params.namespace) ?? null);
              }
            })
            .catch(() => {}),
        ]);
      })
      .catch((cause) => {
        if (active) {
          setError(cloudflareErrorMessage(cause));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [params.accountId, params.connectionId, params.namespace]);

  const keyCount =
    metrics != null || keys != null
      ? Math.max(metrics?.keyCount ?? 0, keys?.length ?? 0)
      : null;

  const confirmDelete = useCallback(() => {
    if (busy) {
      return;
    }
    showActionMenu({
      title: t('storage.deleteNamespace'),
      message: t('storage.deleteNamespaceConfirm', {
        name: params.title ?? params.namespace,
      }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.deleteNamespace'),
          destructive: true,
          onPress: () => {
            setBusy(true);
            void getBearerForConnection(params.connectionId)
              .then((bearer) =>
                deleteKvNamespace(bearer, params.accountId, params.namespace),
              )
              .then(() => {
                invalidateStorageSnapshot();
                showToast(t('storage.namespaceDeleted'));
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
    params.namespace,
    params.title,
    router,
    showToast,
    t,
  ]);

  return (
    <ZoneSubpage
      backLabel={t('storage.title')}
      error={error}
      loading={loading}
      subtitle={params.accountName}
      title={params.title ?? params.namespace}
    >
      <View style={styles.tileRow}>
        <MetricTile
          Icon={KeyRound}
          color={accent.blue}
          label={t('storage.sectionKeys')}
          value={keyCount != null ? compactNumber(keyCount) : '—'}
        />
        <MetricTile
          Icon={KeyRound}
          color={accent.orange}
          label={t('storage.stored')}
          value={metrics ? formatBytes(metrics.byteCount) : '—'}
        />
      </View>
      <View style={styles.tileRow}>
        <MetricTile
          Icon={ArrowDownToLine}
          color={accent.green}
          label={t('storage.readsLabel')}
          sub={t('storage.last24h')}
          value={metrics ? compactNumber(metrics.reads) : '—'}
        />
        <MetricTile
          Icon={ArrowUpFromLine}
          color={accent.purple}
          label={t('storage.writesLabel')}
          sub={t('storage.last24h')}
          value={metrics ? compactNumber(metrics.writes) : '—'}
        />
      </View>

      <SectionLabel>{t('storage.sectionDetails')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          last
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
      </Card>

      <SectionLabel>
        {t('storage.sectionKeys')}
        {keys ? ` · ${keys.length}` : ''}
      </SectionLabel>
      {keys && keys.length > 0 ? (
        <Card>
          {keys.map((key, index) => (
            <ListRow
              key={key.name}
              chevron={false}
              last={index === keys.length - 1}
              testID={`kv-key-${index}`}
              left={
                <Text
                  numberOfLines={1}
                  style={[styles.mono, { color: colors.text }]}
                >
                  {key.name}
                </Text>
              }
            />
          ))}
        </Card>
      ) : (
        <Text style={[styles.empty, { color: label(mode, 0.4) }]}>
          {t('storage.noKeys')}
        </Text>
      )}

      <SectionLabel>{t('storage.sectionActions')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          last
          onPress={busy ? undefined : confirmDelete}
          testID="kv-delete-namespace"
          left={
            <Text style={styles.deleteLabel}>
              {t('storage.deleteNamespace')}
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
  empty: {
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 32,
    textAlign: 'center',
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
