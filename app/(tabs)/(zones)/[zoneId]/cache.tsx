import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  fetchZoneTraffic,
  type ZoneTraffic,
} from '@/src/cloudflare/analytics';
import { purgeZoneCache } from '@/src/cloudflare/api';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import { Card, ListRow, SectionLabel } from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label } from '@/src/theme/tokens';
import { compactNumber, formatBytes } from '@/src/utils/format';

export default function ZoneCache() {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
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

  useEffect(() => {
    let active = true;
    void getBearerForConnection(params.connectionId)
      .then(async (resolved) => {
        if (active) {
          setBearer(resolved);
        }
        // Traffic stats are optional; the purge action works without them.
        const result = await fetchZoneTraffic(resolved, params.zoneId).catch(
          () => null,
        );
        if (active) {
          setTraffic(result);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cloudflareErrorMessage(cause));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [params.zoneId, params.connectionId]);

  const confirmPurge = () => {
    Alert.alert(t('zone.purgeCache'), t('zone.purgeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('zone.purgeCache'),
        onPress: () => {
          setBusy(true);
          void purgeZoneCache(bearer ?? '', params.zoneId)
            .then(() => setPurged(true))
            .catch((cause) => {
              Alert.alert(
                t('zone.actionFailed'),
                cloudflareErrorMessage(cause),
              );
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
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
    fontSize: 17,
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
    fontSize: 12,
    fontWeight: '500',
  },
  tileValue: {
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
