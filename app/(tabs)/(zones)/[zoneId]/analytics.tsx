import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  fetchZoneDaily,
  fetchZoneHourly,
  type ZoneDailyAnalytics,
  type ZoneHourlyAnalytics,
} from '@/src/cloudflare/analytics';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  AreaChart,
  Card,
  ListRow,
  SectionLabel,
  SegmentedControl,
  SkeletonCard,
  type Segment,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, label, spacing } from '@/src/theme/tokens';
import { compactNumber, formatBytes, preciseTens } from '@/src/utils/format';

type Range = '24h' | '7d' | '30d';

export default function ZoneAnalytics() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    zoneId: string;
    connectionId: string;
    name?: string;
    /** Optional 24h visit count carried over from the list page. */
    visits?: string;
  }>();
  const passedVisits =
    params.visits != null && params.visits !== '' && !Number.isNaN(Number(params.visits))
      ? Number(params.visits)
      : null;
  const [range, setRange] = useState<Range>('24h');
  const [hourly, setHourly] = useState<ZoneHourlyAnalytics | null>(null);
  const [daily, setDaily] = useState<{
    days: number;
    data: ZoneDailyAnalytics;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rangeDays = range === '7d' ? 7 : 30;

  const load = useCallback(async () => {
    setError(null);
    try {
      const bearer = await getBearerForConnection(params.connectionId);
      if (range === '24h') {
        setHourly(await fetchZoneHourly(bearer, params.zoneId));
      } else {
        setDaily({
          days: rangeDays,
          data: await fetchZoneDaily(bearer, params.zoneId, rangeDays),
        });
      }
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    }
  }, [params.zoneId, params.connectionId, range, rangeDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const is24h = range === '24h';
  const dailyReady = daily?.days === rangeDays ? daily.data : null;
  const ready = is24h ? !!hourly : !!dailyReady;
  const firstLoad = !hourly && !daily;

  const requests = is24h
    ? hourly?.requests ?? null
    : dailyReady?.requests ?? null;
  const series = is24h ? hourly?.series ?? [] : dailyReady?.series ?? [];
  const cacheRatioPct = is24h
    ? hourly?.cacheRatioPct ?? null
    : dailyReady?.cacheRatioPct ?? null;
  const threats = is24h ? hourly?.threats ?? null : dailyReady?.threats ?? null;

  const rangeSub = is24h
    ? t('zone.sub24h')
    : range === '7d'
      ? t('analytics.rangeSub7d')
      : t('analytics.rangeSub30d');

  const breakdown = ready
    ? [
        {
          key: 'cache',
          label: t('analytics.cacheHitRate'),
          value: cacheRatioPct !== null ? `${cacheRatioPct}%` : '—',
          color: accent.blue,
        },
        {
          key: 'threats',
          label: t('zone.threatsBlocked'),
          value: threats !== null ? compactNumber(threats) : '—',
          color: accent.red,
        },
        is24h
          ? {
              key: 'visits',
              label: t('analytics.eyeballVisits'),
              value: (() => {
                const v = hourly?.visits ?? passedVisits;
                return v !== null ? preciseTens(v) : '—';
              })(),
              color: accent.green,
            }
          : {
              key: 'bandwidth',
              label: t('home.bandwidth'),
              value: formatBytes(dailyReady?.bytes ?? 0),
              color: accent.green,
            },
      ]
    : [];

  const segments: readonly Segment<Range>[] = [
    { id: '24h', label: t('analytics.range24h') },
    { id: '7d', label: t('analytics.range7d') },
    { id: '30d', label: t('analytics.range30d') },
  ];

  return (
    <ZoneSubpage
      backLabel={params.name ?? t('zone.fallbackTitle')}
      error={error}
      loading={firstLoad && !error}
      onRefresh={load}
      subtitle={params.name}
      title={t('zone.svcAnalytics')}
    >
      <View style={styles.controlWrap}>
        <SegmentedControl<Range>
          onChange={setRange}
          segments={segments}
          selected={range}
          testIDPrefix="zone-analytics-range"
        />
      </View>

      {!ready ? (
        <View style={styles.inlineLoading}>
          <SkeletonCard rows={3} />
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
              <AreaChart color={accent.orange} data={series} />
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
    ...fontFace('footnote'),
    marginBottom: 12,
  },
  chartTitle: {
    ...fontFace('body', '600'),
  },
  chartValue: {
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  controlWrap: {
    marginTop: spacing.md,
  },
  inlineLoading: {
    marginTop: spacing.md,
  },
  rowLabel: {
    ...fontFace('headline', '400'),
  },
  rowValue: {
    ...fontFace('headline'),
    fontVariant: ['tabular-nums'],
  },
});
