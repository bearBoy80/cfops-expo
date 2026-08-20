import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  aggregateAnalytics,
  aggregateRange,
  fetchAnalyticsSnapshot,
  fetchZonesRangeSnapshot,
  type AggregatedRange,
  type AnalyticsSnapshot,
  type RangeTrafficSnapshot,
} from '@/src/cloudflare/analytics';
import { fetchZonesSnapshot } from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  AreaChart,
  Card,
  ListRow,
  SectionLabel,
  SegmentedControl,
  SkeletonCard,
  InlineEmpty,
  type Segment,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label, spacing } from '@/src/theme/tokens';
import { compactNumber, formatBytes, preciseTens } from '@/src/utils/format';

type Range = '24h' | '7d' | '30d';

export default function HomeAnalytics() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    accountId?: string;
    accountName?: string;
  }>();
  const [range, setRange] = useState<Range>('24h');
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [rangeSnap, setRangeSnap] = useState<RangeTrafficSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountId = params.accountId || undefined;
  const rangeDays = range === '7d' ? 7 : 30;

  const load = useCallback(
    async (force?: boolean) => {
      setError(null);
      try {
        const zones = await fetchZonesSnapshot();
        if (range === '24h') {
          setSnapshot(await fetchAnalyticsSnapshot(zones, { force }));
        } else {
          setRangeSnap(await fetchZonesRangeSnapshot(zones, rangeDays, { force }));
        }
      } catch (cause) {
        setError(cloudflareErrorMessage(cause));
      }
    },
    [range, rangeDays],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const aggregate = useMemo(
    () => (snapshot ? aggregateAnalytics(snapshot, accountId) : null),
    [accountId, snapshot],
  );
  const rangeAgg = useMemo<AggregatedRange | null>(
    () =>
      rangeSnap && rangeSnap.days === rangeDays
        ? aggregateRange(rangeSnap, accountId)
        : null,
    [accountId, rangeSnap, rangeDays],
  );

  const is24h = range === '24h';
  const ready = is24h ? !!aggregate : !!rangeAgg;
  const firstLoad = !snapshot && !rangeSnap;

  const requests = is24h ? aggregate?.requests ?? null : rangeAgg?.requests ?? null;
  const series = is24h ? aggregate?.series ?? [] : rangeAgg?.series ?? [];
  const threats = is24h ? aggregate?.threats ?? null : rangeAgg?.threats ?? null;
  const bytes = is24h ? aggregate?.bytes ?? 0 : rangeAgg?.bytes ?? 0;
  const cachedBytes = is24h
    ? aggregate?.cachedBytes ?? 0
    : rangeAgg?.cachedBytes ?? 0;
  const cacheHit = bytes > 0 ? Math.round((cachedBytes / bytes) * 100) : null;

  const rangeSub = is24h
    ? t('home.metricSub24h')
    : range === '7d'
      ? t('analytics.rangeSub7d')
      : t('analytics.rangeSub30d');

  const breakdown = ready
    ? [
        is24h && aggregate
          ? {
              key: 'visits',
              label: t('analytics.eyeballVisits'),
              value:
                aggregate.visits !== null
                  ? preciseTens(aggregate.visits)
                  : '—',
              color: accent.green,
            }
          : null,
        {
          key: 'cache',
          label: t('analytics.cacheHitRate'),
          value: cacheHit !== null ? `${cacheHit}%` : '—',
          color: accent.blue,
        },
        {
          key: 'threats',
          label: t('home.metricThreats'),
          value: threats !== null ? compactNumber(threats) : '—',
          color: accent.red,
        },
        {
          key: 'bandwidth',
          label: t('home.bandwidth'),
          value: formatBytes(bytes),
          color: accent.green,
        },
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  const segments: readonly Segment<Range>[] = [
    { id: '24h', label: t('analytics.range24h') },
    { id: '7d', label: t('analytics.range7d') },
    { id: '30d', label: t('analytics.range30d') },
  ];

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={error}
      loading={firstLoad && !error}
      onRefresh={() => load(true)}
      subtitle={params.accountName ?? t('home.analyticsAllZones')}
      title={t('home.quickAnalytics')}
    >
      <View style={styles.controlWrap}>
        <SegmentedControl<Range>
          onChange={setRange}
          segments={segments}
          selected={range}
          testIDPrefix="analytics-range"
        />
      </View>

      {!ready ? (
        <View style={styles.inlineLoading}>
          <SkeletonCard rows={4} />
        </View>
      ) : requests !== null ? (
        <>
          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>
              {t('analytics.requestVolume')}
            </Text>
            <Text style={[styles.chartValue, { color: colors.text }]}>
              {compactNumber(requests)}
            </Text>
            <Text style={[styles.chartSub, { color: label(mode, 0.4) }]}>
              {rangeSub}
            </Text>
            {series.length >= 2 ? (
              <View style={styles.chartWrap}>
                <AreaChart color={accent.orange} data={series} />
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
      ) : (
        <InlineEmpty>{t('home.quickAnalyticsSub')}</InlineEmpty>
      )}
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
  controlWrap: {
    marginTop: spacing.md,
  },
  inlineLoading: {
    marginTop: spacing.lg,
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
  rowLabel: {
    fontSize: 17,
  },
  rowValue: {
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
});
