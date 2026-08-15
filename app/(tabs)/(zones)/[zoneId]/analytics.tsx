import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  fetchZoneHourly,
  type ZoneHourlyAnalytics,
} from '@/src/cloudflare/analytics';
import { getBearerForConnection } from '@/src/cloudflare/resources';
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
import { compactNumber } from '@/src/utils/format';

export default function ZoneAnalytics() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    zoneId: string;
    connectionId: string;
    name?: string;
  }>();
  const [hourly, setHourly] = useState<ZoneHourlyAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getBearerForConnection(params.connectionId)
      .then((bearer) => fetchZoneHourly(bearer, params.zoneId))
      .then((result) => {
        if (active) {
          setHourly(result);
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
  }, [params.zoneId, params.connectionId]);

  const breakdown = hourly
    ? [
        {
          key: 'cache',
          label: t('analytics.cacheHitRate'),
          value:
            hourly.cacheRatioPct !== null ? `${hourly.cacheRatioPct}%` : '—',
          color: accent.blue,
        },
        {
          key: 'threats',
          label: t('zone.threatsBlocked'),
          value: compactNumber(hourly.threats),
          color: accent.red,
        },
        {
          key: 'visits',
          label: t('analytics.eyeballVisits'),
          value:
            hourly.visits !== null ? compactNumber(hourly.visits) : '—',
          color: accent.green,
        },
      ]
    : [];

  return (
    <ZoneSubpage
      backLabel={params.name ?? t('zone.fallbackTitle')}
      error={error}
      loading={!hourly}
      subtitle={
        params.name ? `${params.name} · ${t('zone.sub24h')}` : t('zone.sub24h')
      }
      title={t('zone.svcAnalytics')}
    >
      {hourly ? (
        <>
          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>
              {t('analytics.requestVolume')}
            </Text>
            <Text style={[styles.chartValue, { color: colors.text }]}>
              {compactNumber(hourly.requests)}
            </Text>
            <Text style={[styles.chartSub, { color: label(mode, 0.4) }]}>
              {t('zone.sub24h')}
            </Text>
            {hourly.series.length >= 2 ? (
              <AreaChart color={accent.orange} data={hourly.series} />
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
  rowLabel: {
    fontSize: 17,
  },
  rowValue: {
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
});
