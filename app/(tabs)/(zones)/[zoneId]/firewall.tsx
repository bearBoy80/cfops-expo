import { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  fetchZoneFirewallEvents,
  fetchZoneHourly,
  type ZoneFirewallEvent,
} from '@/src/cloudflare/analytics';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  CardRow,
  ListRow,
  MetricTile,
  Pill,
  type Status,
  InlineEmpty,
  PermissionNotice,
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

export default function ZoneFirewall() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    zoneId: string;
    connectionId: string;
    name?: string;
  }>();
  const [events, setEvents] = useState<ZoneFirewallEvent[] | null>(null);
  const [threats, setThreats] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);
    try {
      const bearer = await getBearerForConnection(params.connectionId);
      // Firewall analytics are permission-gated (zone Analytics read). A
      // failure here should surface a clear permission hint, not block the
      // whole page with a generic error.
      let denied = false;
      const [eventsResult, hourly] = await Promise.all([
        fetchZoneFirewallEvents(bearer, params.zoneId).catch(() => {
          denied = true;
          return [] as ZoneFirewallEvent[];
        }),
        fetchZoneHourly(bearer, params.zoneId).catch(() => null),
      ]);
      setPermissionDenied(denied);
      setEvents(eventsResult);
      setThreats(hourly?.threats ?? null);
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    }
  }, [params.zoneId, params.connectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const challenged = (events ?? []).filter((event) =>
    event.action.includes('challenge'),
  ).length;

  const eventKey = useCallback(
    (event: ZoneFirewallEvent, index: number) => `${event.datetime}-${index}`,
    [],
  );

  const renderEvent = useCallback(
    ({ item, index }: ListRenderItemInfo<ZoneFirewallEvent>) => {
      const last = index === (events?.length ?? 0) - 1;
      return (
        <CardRow first={index === 0} last={last}>
          <ListRow
            chevron={false}
            last={last}
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
                  {[item.clientIP, item.country, item.path]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            }
          />
        </CardRow>
      );
    },
    [colors.text, events?.length, mode],
  );

  return (
    <ZoneSubpage
      backLabel={params.name ?? t('zone.fallbackTitle')}
      error={error}
      list={
        permissionDenied
          ? undefined
          : {
              data: events ?? [],
              keyExtractor: eventKey,
              renderItem: renderEvent,
              empty: <InlineEmpty>{t('firewall.noEvents')}</InlineEmpty>,
            }
      }
      loading={!events}
      onRefresh={load}
      subtitle={params.name}
      title={t('zone.svcFirewall')}
    >
      {permissionDenied ? (
        <PermissionNotice
          title={t('common.permissionRequired')}
          message={t('zone.firewallNoPerm')}
          actionLabel={t('common.openApiTokens')}
          onAction={() => {
            void Linking.openURL(
              'https://dash.cloudflare.com/profile/api-tokens',
            );
          }}
        />
      ) : events ? (
        <>
          <View style={styles.tileRow}>
            <MetricTile
              color={accent.red}
              label={t('firewall.blocked')}
              sub={t('zone.sub24h')}
              value={threats !== null ? compactNumber(threats) : '—'}
            />
            <MetricTile
              color={accent.yellow}
              label={t('firewall.challenged')}
              sub={t('zone.sub24h')}
              value={String(challenged)}
            />
          </View>

          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t('firewall.liveEvents')}</Text>
          </View>

        </>
      ) : null}
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
