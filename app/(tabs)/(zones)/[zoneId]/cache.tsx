import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  fetchZoneTraffic,
  type ZoneTraffic,
} from '@/src/cloudflare/analytics';
import { purgeZoneCache } from '@/src/cloudflare/api';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import { confirmPurgeCache } from '@/src/cloudflare/zoneActions';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import { Card, ListRow, SectionLabel, useToast } from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, label } from '@/src/theme/tokens';
import { compactNumber, formatBytes } from '@/src/utils/format';

export default function ZoneCache() {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    zoneId: string;
    connectionId: string;
    name?: string;
  }>();
  const [traffic, setTraffic] = useState<ZoneTraffic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bearer, setBearer] = useState<string | null>(null);
  const [purged, setPurged] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const resolved = await getBearerForConnection(params.connectionId);
      setBearer(resolved);
      // Traffic stats are optional; the purge action works without them.
      const result = await fetchZoneTraffic(resolved, params.zoneId).catch(
        () => null,
      );
      setTraffic(result);
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [params.zoneId, params.connectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmPurge = () => {
    confirmPurgeCache(t, params.name, () => {
      setBusy(true);
      void purgeZoneCache(bearer ?? '', params.zoneId)
        .then(() => setPurged(true))
        .catch((cause) => {
          showToast(cloudflareErrorMessage(cause), 'error');
        })
        .finally(() => setBusy(false));
    });
  };

  const stats = [
    {
      key: 'ratio',
      label: t('zone.cacheRatio'),
      value:
        traffic?.cacheRatioPct !== null && traffic?.cacheRatioPct !== undefined
          ? `${traffic.cacheRatioPct}%`
          : '—',
      color: accent.blue,
    },
    {
      key: 'bandwidth',
      label: t('cache.bandwidthSaved'),
      value: traffic ? formatBytes(traffic.cachedBytes) : '—',
      color: accent.green,
    },
    {
      key: 'cachedRequests',
      label: t('cache.cachedRequests'),
      value: traffic ? compactNumber(traffic.cachedRequests) : '—',
      color: accent.orange,
    },
    {
      key: 'totalRequests',
      label: t('zone.totalRequests'),
      value: traffic ? compactNumber(traffic.requests) : '—',
      color: accent.purple,
    },
  ];

  return (
    <ZoneSubpage
      backLabel={params.name ?? t('zone.fallbackTitle')}
      error={error}
      loading={loading}
      onRefresh={load}
      subtitle={
        params.name ? `${params.name} · ${t('cache.sub30d')}` : t('cache.sub30d')
      }
      title={t('zone.svcCache')}
    >
      <View style={styles.grid}>
        {stats.map((stat) => (
          <View
            key={stat.key}
            style={[styles.tile, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.tileValue, { color: stat.color }]}>
              {stat.value}
            </Text>
            <Text style={[styles.tileLabel, { color: label(mode, 0.9) }]}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      <SectionLabel>{t('zone.sectionActions')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          last
          onPress={busy || !bearer ? undefined : confirmPurge}
          testID="cache-purge"
          left={
            <View style={styles.actionRow}>
              {purged ? (
                <CheckCircle color={accent.green} size={15} />
              ) : (
                <RefreshCw color={accent.orange} size={15} />
              )}
              <Text
                style={[
                  styles.actionLabel,
                  { color: purged ? accent.green : accent.orange },
                ]}
              >
                {purged ? t('cache.purgeDoneInline') : t('cache.purgeEverything')}
              </Text>
            </View>
          }
        />
      </Card>
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  actionLabel: {
    ...fontFace('headline', '400'),
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  tile: {
    borderRadius: 16,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
    padding: 16,
  },
  tileLabel: {
    ...fontFace('footnote', '500'),
  },
  tileValue: {
    ...fontFace('title'),
    fontVariant: ['tabular-nums'],
  },
});
