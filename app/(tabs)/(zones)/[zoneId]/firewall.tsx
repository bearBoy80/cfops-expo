import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  fetchZoneFirewallEvents,
  fetchZoneHourly,
  type ZoneFirewallEvent,
} from '../../../../src/cloudflare/analytics';
import { getBearerForConnection } from '../../../../src/cloudflare/resources';
import { ZoneSubpage } from '../../../../src/components/ZoneSubpage';
import {
  Card,
  ListRow,
  MetricTile,
  Pill,
  type Status,
} from '../../../../src/components/ui';
import { cloudflareErrorMessage } from '../../../../src/i18n/errors';
import { useTheme } from '../../../../src/theme/ThemeContext';
import { accent, label } from '../../../../src/theme/tokens';
import { compactNumber } from '../../../../src/utils/format';

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

  useEffect(() => {
    let active = true;
    void getBearerForConnection(params.connectionId)
      .then((bearer) =>
        Promise.all([
          fetchZoneFirewallEvents(bearer, params.zoneId),
          fetchZoneHourly(bearer, params.zoneId).catch(() => null),
        ]),
      )
      .then(([eventsResult, hourly]) => {
        if (active) {
          setEvents(eventsResult);
          setThreats(hourly?.threats ?? null);
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

  const challenged = (events ?? []).filter((event) =>
    event.action.includes('challenge'),
  ).length;

  return (
    <ZoneSubpage
      backLabel={params.name ?? t('zone.fallbackTitle')}
      error={error}
      loading={!events}
      subtitle={params.name}
      title={t('zone.svcFirewall')}
    >
      {events ? (
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

          {events.length > 0 ? (
            <Card>
              {events.map((event, index) => (
                <ListRow
                  key={`${event.datetime}-${index}`}
                  chevron={false}
                  last={index === events.length - 1}
                  left={
                    <View style={styles.eventCopy}>
                      <View style={styles.eventTop}>
                        <Pill status={eventPillStatus(event.action)} />
                        <Text
                          numberOfLines={1}
                          style={[styles.rule, { color: colors.text }]}
                        >
                          {event.ruleId || event.action}
                        </Text>
                        <Text
                          style={[styles.time, { color: label(mode, 0.4) }]}
                        >
                          {eventTime(event.datetime)}
                        </Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[styles.eventSub, { color: label(mode, 0.4) }]}
                      >
                        {[event.clientIP, event.country, event.path]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  }
                />
              ))}
            </Card>
          ) : (
            <Text style={[styles.empty, { color: label(mode, 0.4) }]}>
              {t('firewall.noEvents')}
            </Text>
          )}
        </>
      ) : null}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
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
    color: accent.red,
    fontSize: 13,
    fontWeight: '600',
  },
  rule: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  time: {
    fontSize: 12,
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
