import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  aggregateAnalytics,
  fetchAnalyticsSnapshot,
  type AnalyticsSnapshot,
  type FirewallEvent,
} from '@/src/cloudflare/analytics';
import {
  fetchZonesSnapshot,
  type ZonesSnapshot,
} from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  CardRow,
  ListRow,
  MetricTile,
  Pill,
  type Status,
  InlineEmpty,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, label } from '@/src/theme/tokens';
import { compactNumber } from '@/src/utils/format';

function eventPillStatus(action: string): Status {
  if (action.includes('challenge')) {
    return 'challenge';
  }
  return action === 'block' ? 'block' : 'log';
}

function eventTime(datetime: string): string {
  if (!datetime) {
    return '';
  }
  const date = new Date(datetime);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')}`;
}

export default function HomeFirewall() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{ accountId?: string }>();
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
  const events = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.events.filter(
      (event) => !accountId || event.accountId === accountId,
    );
  }, [accountId, snapshot]);
  const challenged = events.filter((event) =>
    event.action.includes('challenge'),
  ).length;

  const eventKey = useCallback(
    (event: FirewallEvent, index: number) =>
      `${event.zoneId}-${event.datetime}-${index}`,
    [],
  );

  const renderEvent = useCallback(
    ({ item, index }: ListRenderItemInfo<FirewallEvent>) => {
      const last = index === events.length - 1;
      return (
        <CardRow first={index === 0} last={last}>
          <ListRow
            last={last}
            testID={`home-firewall-event-${index}`}
            onPress={() => {
              const zone = zones?.zones.find((zn) => zn.id === item.zoneId);
              if (!zone) {
                return;
              }
              router.push({
                pathname: '/(tabs)/(zones)/[zoneId]/firewall',
                params: {
                  zoneId: zone.id,
                  connectionId: zone.connectionId,
                  name: zone.name,
                },
              });
            }}
            left={
              <View style={styles.eventCopy}>
                <View style={styles.eventTop}>
                  <Pill status={eventPillStatus(item.action)} />
                  <Text
                    numberOfLines={1}
                    style={[styles.rule, { color: colors.text }]}
                  >
                    {item.ruleId || item.action}
                  </Text>
                  <Text style={[styles.time, { color: label(mode, 0.4) }]}>
                    {eventTime(item.datetime)}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.eventSub, { color: label(mode, 0.4) }]}
                >
                  {[item.clientIP, item.country].filter(Boolean).join(' · ')}
                </Text>
              </View>
            }
          />
        </CardRow>
      );
    },
    [colors.text, events.length, mode, router, zones],
  );

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={error}
      list={{
        data: events,
        keyExtractor: eventKey,
        renderItem: renderEvent,
        empty: snapshot ? (
          <InlineEmpty>{t('firewall.noEvents')}</InlineEmpty>
        ) : null,
      }}
      loading={!snapshot && !error}
      onRefresh={load}
      subtitle={t('home.firewallSubtitle')}
      title={t('home.quickFirewall')}
    >
      <View style={styles.tileRow}>
        <MetricTile
          color={accent.red}
          label={t('firewall.blocked')}
          sub={t('home.metricSub24h')}
          value={
            aggregate ? compactNumber(aggregate.threats) : '—'
          }
        />
        <MetricTile
          color={accent.yellow}
          label={t('firewall.challenged')}
          sub={t('home.metricSub24h')}
          value={snapshot ? compactNumber(challenged) : '—'}
        />
      </View>

      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>{t('firewall.liveEvents')}</Text>
      </View>

    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  eventCopy: {
    flex: 1,
    minWidth: 0,
  },
  eventSub: {
    fontFamily: 'Menlo',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  eventTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  liveDot: {
    backgroundColor: accent.red,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  liveRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  liveText: {
    ...fontFace('subhead', '600'),
    color: accent.red,
  },
  rule: {
    ...fontFace('body', '500'),
    flexShrink: 1,
  },
  time: {
    ...fontFace('footnote'),
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 16,
  },
});
