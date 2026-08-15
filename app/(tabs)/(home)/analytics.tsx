import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  aggregateAnalytics,
  fetchAnalyticsSnapshot,
  type AnalyticsSnapshot,
} from '@/src/cloudflare/analytics';
import { fetchZonesSnapshot } from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  AreaChart,
  Card,
  ListRow,
  SectionLabel,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label } from '@/src/theme/tokens';
import { compactNumber, formatBytes } from '@/src/utils/format';

export default function HomeAnalytics() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    accountId?: string;
    accountName?: string;
  }>();
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchZonesSnapshot()
      .then((zones) => fetchAnalyticsSnapshot(zones))
      .then((next) => {
        if (active) {
          setSnapshot(next);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cloudflareErrorMessage(cause));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const accountId = params.accountId || undefined;
  const aggregate = useMemo(
    () => (snapshot ? aggregateAnalytics(snapshot, accountId) : null),
    [accountId, snapshot],
  );
  const cacheHit =
    aggregate && aggregate.bytes > 0
      ? Math.round((aggregate.cachedBytes / aggregate.bytes) * 100)
      : null;

  const breakdown = aggregate
    ? [
        {
          key: 'visits',
          label: t('analytics.eyeballVisits'),
          value:
            aggregate.visits !== null
              ? compactNumber(aggregate.visits)
              : '—',
          color: accent.green,
        },
        {
          key: 'cache',
          label: t('analytics.cacheHitRate'),
          value: cacheHit !== null ? `${cacheHit}%` : '—',
          color: accent.blue,
        },
        {
          key: 'threats',
          label: t('home.metricThreats'),
          value: compactNumber(aggregate.threats),
          color: accent.red,
        },
        {
          key: 'bandwidth',
          label: t('home.bandwidth'),
          value: formatBytes(aggregate.bytes),
          color: accent.green,
        },
      ]
    : [];

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={error}
      loading={!snapshot && !error}
      subtitle={
        params.accountName
          ? `${params.accountName} · ${t('home.metricSub24h')}`
          : `${t('home.analyticsAllZones')} · ${t('home.metricSub24h')}`
      }
      title={t('home.quickAnalytics')}
    >
      {aggregate ? (
        <>
          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>
              {t('analytics.requestVolume')}
            </Text>
            <Text style={[styles.chartValue, { color: colors.text }]}>
              {compactNumber(aggregate.requests)}
            </Text>
            <Text style={[styles.chartSub, { color: label(mode, 0.4) }]}>
              {t('home.metricSub24h')}
            </Text>
            {aggregate.series.length >= 2 ? (
              <View style={styles.chartWrap}>
                <AreaChart color={accent.orange} data={aggregate.series} />
              </View>
            ) : null}
          </View>

          <SectionLabel>{t('analytics.breakdown')}</SectionLabel>
          <Card>
            {breakdown.map((item, index) => (
              <ListRow
                key={item.key}
                chevron={false}
                last={index === breakdown.length - 1}
                left={
                  <Text style={[styles.rowLabel, { color: colors.text }]}>
                    {item.label}
                  </Text>
                }
                right={
                  <Text style={[styles.rowValue, { color: item.color }]}>
                    {item.value}
                  </Text>
                }
              />
            ))}
          </Card>
        </>
      ) : snapshot ? (
        <Text style={[styles.empty, { color: label(mode, 0.4) }]}>
          {t('home.quickAnalyticsSub')}
        </Text>
      ) : null}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  chartCard: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
  },
  chartSub: {
    fontSize: 12,
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  chartValue: {
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  chartWrap: {
    marginTop: 4,
  },
  empty: {
    fontSize: 15,
    marginTop: 16,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  rowLabel: {
    fontSize: 17,
  },
  rowValue: {
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
});
