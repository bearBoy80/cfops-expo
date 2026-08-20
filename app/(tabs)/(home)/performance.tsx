import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Globe } from 'lucide-react-native';
import {
  aggregateAnalytics,
  fetchAnalyticsSnapshot,
  type AnalyticsSnapshot,
  type ZoneAnalytics,
} from '@/src/cloudflare/analytics';
import {
  fetchZonesSnapshot,
  type ZonesSnapshot,
} from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import { Card, SectionLabel, InlineEmpty } from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, hairline, label, tint } from '@/src/theme/tokens';
import { compactNumber, formatBytes, preciseTens } from '@/src/utils/format';

function cacheRatio(zone: { bytes: number; cachedBytes: number }): number | null {
  if (zone.bytes <= 0) {
    return null;
  }
  return Math.round((zone.cachedBytes / zone.bytes) * 100);
}

function cacheColor(pct: number | null): string {
  if (pct === null) {
    return accent.gray;
  }
  if (pct >= 70) {
    return accent.green;
  }
  if (pct >= 40) {
    return accent.yellow;
  }
  return accent.orange;
}

function CacheBar({ pct }: { pct: number | null }) {
  const { mode } = useTheme();
  const color = cacheColor(pct);
  return (
    <View
      style={[styles.barTrack, { backgroundColor: hairline(mode, 0.08) }]}
    >
      <View
        style={[
          styles.barFill,
          {
            backgroundColor: color,
            width: `${pct ?? 0}%`,
          },
        ]}
      />
    </View>
  );
}

export default function HomePerformance() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    accountId?: string;
    accountName?: string;
  }>();
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [zones, setZones] = useState<ZonesSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const nextZones = await fetchZonesSnapshot();
      setZones(nextZones);
      const next = await fetchAnalyticsSnapshot(nextZones);
      setSnapshot(next);
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accountId = params.accountId || undefined;
  const aggregate = useMemo(
    () => (snapshot ? aggregateAnalytics(snapshot, accountId) : null),
    [accountId, snapshot],
  );
  const rows = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.zones
      .filter((zone) => !accountId || zone.accountId === accountId)
      .slice()
      .sort((a, b) => b.requests - a.requests);
  }, [accountId, snapshot]);
  const zoneById = useMemo(() => {
    const map = new Map(
      (zones?.zones ?? []).map((zone) => [zone.id, zone] as const),
    );
    return map;
  }, [zones]);

  const overallCache = aggregate ? cacheRatio(aggregate) : null;

  const openZone = (zone: ZoneAnalytics) => {
    const match = zoneById.get(zone.zoneId);
    if (!match) {
      return;
    }
    router.push({
      pathname: '/(tabs)/(zones)/[zoneId]/analytics',
      params: {
        zoneId: match.id,
        connectionId: match.connectionId,
        name: match.name,
        ...(zone.visits !== null ? { visits: String(zone.visits) } : {}),
      },
    } as unknown as Href);
  };

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={error}
      loading={!snapshot && !error}
      onRefresh={load}
      subtitle={
        params.accountName
          ? `${params.accountName} · ${t('home.metricSub24h')}`
          : `${t('home.analyticsAllZones')} · ${t('home.metricSub24h')}`
      }
      title={t('home.mgmtAnalytics')}
    >
      {aggregate ? (
        <View style={[styles.summary, { backgroundColor: colors.surface }]}>
          <Text style={[styles.heroValue, { color: colors.text }]}>
            {aggregate.visits !== null
              ? preciseTens(aggregate.visits)
              : '—'}
          </Text>
          <Text style={[styles.heroLabel, { color: label(mode, 0.45) }]}>
            {t('home.visitorsSub')}
          </Text>
          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {aggregate.pageViews !== null
                  ? preciseTens(aggregate.pageViews)
                  : '—'}
              </Text>
              <Text style={[styles.summaryLabel, { color: label(mode, 0.45) }]}>
                {t('home.pageViews')}
              </Text>
            </View>
            <View style={styles.summaryStat}>
              <Text
                style={[
                  styles.summaryValue,
                  { color: cacheColor(overallCache) },
                ]}
              >
                {overallCache !== null ? `${overallCache}%` : '—'}
              </Text>
              <Text style={[styles.summaryLabel, { color: label(mode, 0.45) }]}>
                {t('home.performanceCache')}
              </Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {formatBytes(aggregate.bytes)}
              </Text>
              <Text style={[styles.summaryLabel, { color: label(mode, 0.45) }]}>
                {t('home.bandwidth')}
              </Text>
            </View>
          </View>
          <CacheBar pct={overallCache} />
        </View>
      ) : null}

      <SectionLabel>{t('home.performanceZones')}</SectionLabel>

      {rows.length === 0 && snapshot ? (
        <InlineEmpty>
          {t('home.performanceEmpty')}
        </InlineEmpty>
      ) : (
        <Card>
          {rows.map((zone, index) => {
            const name = zoneById.get(zone.zoneId)?.name ?? zone.zoneId;
            const pct = cacheRatio(zone);
            return (
              <View key={zone.zoneId}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openZone(zone)}
                  style={styles.rowPress}
                  testID={`home-performance-${zone.zoneId}`}
                >
                  <View
                    style={[
                      styles.icon,
                      { backgroundColor: tint(accent.blue, '22') },
                    ]}
                  >
                    <Globe
                      accessibilityElementsHidden
                      color={accent.blue}
                      size={16}
                    />
                  </View>
                  <View style={styles.rowBody}>
                    <Text
                      numberOfLines={1}
                      style={[styles.name, { color: colors.text }]}
                    >
                      {name}
                    </Text>
                    {zone.visits !== null ? (
                      <Text style={[styles.visitors, { color: accent.green }]}>
                        {t('home.visitorsCount', {
                          count: preciseTens(zone.visits),
                        })}
                      </Text>
                    ) : null}
                    <View style={styles.metrics}>
                      <View style={styles.metric}>
                        <Text
                          style={[styles.metricValue, { color: colors.text }]}
                        >
                          {compactNumber(zone.requests)}
                        </Text>
                        <Text
                          style={[
                            styles.metricLabel,
                            { color: label(mode, 0.4) },
                          ]}
                        >
                          {t('home.metricRequests')}
                        </Text>
                      </View>
                      <View style={styles.metric}>
                        <Text
                          style={[
                            styles.metricValue,
                            { color: cacheColor(pct) },
                          ]}
                        >
                          {pct !== null ? `${pct}%` : '—'}
                        </Text>
                        <Text
                          style={[
                            styles.metricLabel,
                            { color: label(mode, 0.4) },
                          ]}
                        >
                          {t('home.performanceCache')}
                        </Text>
                      </View>
                      <View style={styles.metric}>
                        <Text
                          style={[styles.metricValue, { color: colors.text }]}
                        >
                          {formatBytes(zone.bytes)}
                        </Text>
                        <Text
                          style={[
                            styles.metricLabel,
                            { color: label(mode, 0.4) },
                          ]}
                        >
                          {t('home.bandwidth')}
                        </Text>
                      </View>
                    </View>
                    <CacheBar pct={pct} />
                  </View>
                  <ChevronRight color={label(mode, 0.3)} size={18} />
                </Pressable>
                {index < rows.length - 1 ? (
                  <View
                    style={[
                      styles.separator,
                      { backgroundColor: hairline(mode, 0.08) },
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  barFill: {
    borderRadius: 3,
    height: '100%',
  },
  barTrack: {
    borderRadius: 3,
    height: 5,
    marginTop: 10,
    overflow: 'hidden',
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    marginTop: 2,
    width: 32,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    ...fontFace('caption'),
    marginTop: 1,
  },
  metricValue: {
    ...fontFace('body', '600'),
    fontVariant: ['tabular-nums'],
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  heroLabel: {
    ...fontFace('subhead'),
    marginBottom: 16,
    marginTop: 4,
  },
  heroValue: {
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  name: {
    ...fontFace('bodyLarge', '600'),
  },
  visitors: {
    ...fontFace('subhead', '600'),
    marginTop: 3,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowPress: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  summary: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
  },
  summaryLabel: {
    ...fontFace('footnote'),
    marginTop: 3,
  },
  summaryStat: {
    flex: 1,
  },
  summaryStats: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryValue: {
    ...fontFace('title'),
    fontVariant: ['tabular-nums'],
  },
});
