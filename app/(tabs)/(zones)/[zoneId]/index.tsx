import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BarChart2,
  ChevronLeft,
  Gauge,
  Lock,
  Server,
  Shield,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  fetchZoneTraffic,
  invalidateAnalyticsSnapshot,
  invalidateZonesRangeSnapshot,
  type ZoneTraffic,
} from '@/src/cloudflare/analytics';
import {
  CloudflareApiError,
  countDnsRecords,
  deleteZone,
  getZone,
  getZoneSslMode,
  purgeZoneCache,
  setZonePaused,
  type CfZone,
} from '@/src/cloudflare/api';
import { listConnections } from '@/src/cloudflare/connections';
import {
  getConnectionBearer,
  invalidateZonesSnapshot,
} from '@/src/cloudflare/resources';
import { confirmPurgeCache } from '@/src/cloudflare/zoneActions';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import {
  AccountChip,
  Card,
  ListRow,
  Pill,
  SectionLabel,
  showActionMenu,
  useToast,
  zonePillStatus,
} from '@/src/components/ui';
import { useTabBarInset } from '@/src/components/useTabBarInset';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, foreground, label } from '@/src/theme/tokens';
import { compactNumber } from '@/src/utils/format';

const sslLabels: Record<string, string> = {
  off: 'Off',
  flexible: 'Flexible',
  full: 'Full',
  strict: 'Full (strict)',
  origin_pull: 'Strict (origin pull)',
};

export default function ZoneDetail() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const bottomInset = useTabBarInset();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    zoneId: string;
    connectionId: string;
    name?: string;
  }>();
  const [zone, setZone] = useState<CfZone | null>(null);
  const [sslMode, setSslMode] = useState<string | null>(null);
  const [traffic, setTraffic] = useState<ZoneTraffic | null>(null);
  const [dnsCount, setDnsCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bearerRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const connections = await listConnections();
      const connection = connections.find(
        (item) => item.id === params.connectionId,
      );
      const bearer = connection ? await getConnectionBearer(connection) : null;
      if (!bearer) {
        throw new CloudflareApiError('missing-credential');
      }
      bearerRef.current = bearer;

      // Traffic and DNS count are best-effort extras around the core zone.
      const [zoneResult, sslResult, trafficResult, dnsResult] =
        await Promise.all([
          getZone(bearer, params.zoneId),
          getZoneSslMode(bearer, params.zoneId).catch(() => null),
          fetchZoneTraffic(bearer, params.zoneId).catch(() => null),
          countDnsRecords(bearer, params.zoneId).catch(() => null),
        ]);
      if (active) {
        setZone(zoneResult);
        setSslMode(sslResult);
        setTraffic(trafficResult);
        setDnsCount(dnsResult);
      }
    };

    void load().catch((cause) => {
      if (active) {
        setError(
          cause instanceof CloudflareApiError
            ? cloudflareErrorMessage(cause)
            : t('errors.zone-load'),
        );
      }
    });

    return () => {
      active = false;
    };
  }, [params.zoneId, params.connectionId]);

  const runAction = useCallback(
    (action: () => Promise<void>) => {
      setBusy(true);
      void action()
        .catch((cause) => {
          showToast(cloudflareErrorMessage(cause), 'error');
        })
        .finally(() => setBusy(false));
    },
    [showToast],
  );

  const confirmPurge = () => {
    confirmPurgeCache(t, zone?.name, () =>
      runAction(async () => {
        await purgeZoneCache(bearerRef.current ?? '', params.zoneId);
        showToast(t('zone.purgeDone'));
      }),
    );
  };

  const confirmPauseToggle = () => {
    if (!zone) {
      return;
    }
    const pausing = !zone.paused;
    const title = pausing ? t('zone.pauseZone') : t('zone.resumeZone');
    showActionMenu({
      title,
      message: t(pausing ? 'zone.pauseConfirm' : 'zone.resumeConfirm', {
        name: zone.name,
      }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: title,
          // Pausing takes the zone off Cloudflare; resuming only restores it.
          destructive: pausing,
          onPress: () =>
            runAction(async () => {
              const updated = await setZonePaused(
                bearerRef.current ?? '',
                params.zoneId,
                pausing,
              );
              setZone(updated);
              invalidateZonesSnapshot();
              invalidateAnalyticsSnapshot();
              showToast(t(pausing ? 'zone.pauseDone' : 'zone.resumeDone'));
            }),
        },
      ],
    });
  };

  const confirmRemove = () => {
    if (!zone) {
      return;
    }
    showActionMenu({
      title: t('zone.removeZone'),
      message: t('zone.removeConfirm', { name: zone.name }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('zone.removeZone'),
          destructive: true,
          onPress: () =>
            runAction(async () => {
              await deleteZone(bearerRef.current ?? '', params.zoneId);
              invalidateZonesSnapshot();
              invalidateAnalyticsSnapshot();
              invalidateZonesRangeSnapshot();
              showToast(t('zone.removeDone'));
              router.back();
            }),
        },
      ],
    });
  };

  const title = zone?.name ?? params.name ?? t('zone.fallbackTitle');
  const sslLabel = sslMode ? (sslLabels[sslMode] ?? sslMode) : '—';
  const cacheLabel =
    traffic?.cacheRatioPct !== null && traffic?.cacheRatioPct !== undefined
      ? `${traffic.cacheRatioPct}%`
      : '—';

  const openService = (
    screen: 'dns' | 'ssl' | 'cache' | 'firewall' | 'analytics',
  ) => {
    router.push({
      pathname: `/(tabs)/(zones)/[zoneId]/${screen}`,
      params: {
        zoneId: params.zoneId,
        connectionId: params.connectionId,
        name: zone?.name ?? params.name ?? '',
      },
    });
  };

  const services = [
    {
      key: 'dns',
      title: t('zone.svcDns'),
      stat:
        dnsCount !== null ? t('zone.recordsCount', { count: dnsCount }) : '—',
      Icon: Server,
      color: accent.blue,
    },
    {
      key: 'ssl',
      title: t('zone.svcSsl'),
      stat: sslLabel,
      Icon: Lock,
      color: accent.yellow,
    },
    {
      key: 'cache',
      title: t('zone.svcCache'),
      stat: cacheLabel,
      Icon: Gauge,
      color: accent.orange,
    },
    {
      key: 'firewall',
      title: t('zone.svcFirewall'),
      stat: traffic
        ? t('zone.blockedCount', { count: compactNumber(traffic.threats) })
        : '—',
      Icon: Shield,
      color: accent.red,
    },
    {
      key: 'analytics',
      title: t('zone.svcAnalytics'),
      stat: traffic
        ? t('zone.reqCount', { value: compactNumber(traffic.requests) })
        : '—',
      Icon: BarChart2,
      color: accent.purple,
    },
  ] as const;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft color={accent.orange} size={22} />
          <Text style={styles.backLabel}>{t('tabs.zones')}</Text>
        </Pressable>

        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {zone ? (
          <View style={styles.statusRow}>
            <AccountChip color={accent.orange} name={zone.accountName} size={18} />
            <Text style={[styles.account, { color: label(mode, 0.5) }]}>
              {zone.accountName}
            </Text>
            <Pill status={zonePillStatus(zone)} />
          </View>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {!zone && !error ? (
          <View style={styles.loading}>
            <ActivityIndicator color={accent.orange} />
          </View>
        ) : null}

        {zone ? (
          <>
            <SectionLabel>{t('zone.sectionDetails')}</SectionLabel>
            <Card>
              <ListRow
                chevron={false}
                left={
                  <Text style={[styles.rowLabel, { color: colors.text }]}>
                    {t('zone.plan')}
                  </Text>
                }
                right={
                  <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
                    {zone.plan}
                  </Text>
                }
              />
              <ListRow
                chevron={false}
                left={
                  <Text style={[styles.rowLabel, { color: colors.text }]}>
                    {t('zone.sslMode')}
                  </Text>
                }
                right={
                  <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
                    {sslLabel}
                  </Text>
                }
              />
              <ListRow
                chevron={false}
                last
                left={
                  <Text style={[styles.rowLabel, { color: colors.text }]}>
                    {t('zone.cacheRatio')}
                  </Text>
                }
                right={
                  <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
                    {cacheLabel}
                  </Text>
                }
              />
            </Card>

            <SectionLabel>{t('zone.sectionTraffic')}</SectionLabel>
            <Card>
              <ListRow
                chevron={false}
                left={
                  <Text style={[styles.rowLabel, { color: colors.text }]}>
                    {t('zone.totalRequests')}
                  </Text>
                }
                right={
                  <Text style={[styles.trafficValue, { color: accent.orange }]}>
                    {traffic ? compactNumber(traffic.requests) : '—'}
                  </Text>
                }
              />
              <ListRow
                chevron={false}
                last
                left={
                  <Text style={[styles.rowLabel, { color: colors.text }]}>
                    {t('zone.threatsBlocked')}
                  </Text>
                }
                right={
                  <Text style={[styles.trafficValue, { color: accent.red }]}>
                    {traffic ? compactNumber(traffic.threats) : '—'}
                  </Text>
                }
              />
            </Card>

            <SectionLabel>{t('zone.sectionServices')}</SectionLabel>
            <Card>
              {services.map((service, index) => (
                <ListRow
                  key={service.key}
                  onPress={() => openService(service.key)}
                  testID={`zone-service-${service.key}`}
                  last={index === services.length - 1}
                  right={
                    <Text
                      style={[styles.serviceStat, { color: label(mode, 0.4) }]}
                    >
                      {service.stat}
                    </Text>
                  }
                  left={
                    <View style={styles.serviceRow}>
                      <View
                        style={[
                          styles.serviceIcon,
                          { backgroundColor: service.color },
                        ]}
                      >
                        <service.Icon
                          accessibilityElementsHidden
                          color={foreground.onAccent}
                          size={16}
                        />
                      </View>
                      <Text
                        style={[styles.serviceTitle, { color: colors.text }]}
                      >
                        {service.title}
                      </Text>
                    </View>
                  }
                />
              ))}
            </Card>

            <SectionLabel>{t('zone.sectionActions')}</SectionLabel>
            <Card>
              <ListRow
                onPress={busy ? undefined : confirmPurge}
                testID="zone-action-purge"
                left={
                  <Text style={[styles.actionLabel, { color: accent.blue }]}>
                    {t('zone.purgeCache')}
                  </Text>
                }
              />
              <ListRow
                onPress={busy ? undefined : confirmPauseToggle}
                testID="zone-action-pause"
                left={
                  <Text style={[styles.actionLabel, { color: accent.blue }]}>
                    {zone.paused ? t('zone.resumeZone') : t('zone.pauseZone')}
                  </Text>
                }
              />
              <ListRow
                chevron={false}
                last
                onPress={busy ? undefined : confirmRemove}
                testID="zone-action-remove"
                left={
                  <Text style={[styles.actionLabel, { color: accent.red }]}>
                    {t('zone.removeZone')}
                  </Text>
                }
                right={
                  busy ? <ActivityIndicator color={accent.red} /> : undefined
                }
              />
            </Card>

            {zone.nameServers.length > 0 ? (
              <>
                <SectionLabel>{t('zone.sectionNameServers')}</SectionLabel>
                <Card>
                  {zone.nameServers.map((server, index) => (
                    <ListRow
                      key={server}
                      chevron={false}
                      last={index === zone.nameServers.length - 1}
                      left={
                        <Text
                          style={[styles.nameServer, { color: colors.text }]}
                        >
                          {server}
                        </Text>
                      }
                    />
                  ))}
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  account: {
    ...fontFace('body'),
  },
  actionLabel: {
    ...fontFace('headline', '400'),
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingTop: 2,
  },
  backLabel: {
    ...fontFace('headline', '400'),
    color: accent.orange,
  },
  content: {},
  error: {
    ...fontFace('body'),
    color: accent.red,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  loading: {
    marginTop: 48,
  },
  nameServer: {
    ...fontFace('subhead'),
    fontFamily: 'Menlo',
  },
  rowLabel: {
    ...fontFace('headline', '400'),
  },
  rowValue: {
    ...fontFace('headline', '400'),
  },
  safeArea: {
    flex: 1,
  },
  serviceIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  serviceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  serviceStat: {
    ...fontFace('body'),
    fontVariant: ['tabular-nums'],
  },
  serviceTitle: {
    ...fontFace('headline', '400'),
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.2,
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  trafficValue: {
    ...fontFace('headline'),
    fontVariant: ['tabular-nums'],
  },
});
