import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Activity,
  BarChart2,
  Bell,
  Check,
  ChevronsUpDown,
  DollarSign,
  FileText,
  Globe,
  HardDrive,
  Layers,
  Server,
  Shield,
  Wifi,
  Zap,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  aggregateAnalytics,
  fetchAnalyticsSnapshot,
  type AnalyticsSnapshot,
} from '../../../src/cloudflare/analytics';
import {
  fetchZonesSnapshot,
  type ZonesSnapshot,
} from '../../../src/cloudflare/resources';
import {
  AccountChip,
  AreaChart,
  Card,
  EmptyState,
  ListRow,
  MetricTile,
  Pill,
  SectionLabel,
  type Status,
} from '../../../src/components/ui';
import { cloudflareErrorMessage } from '../../../src/i18n/errors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { accent, foreground, label, tint } from '../../../src/theme/tokens';
import { compactNumber, formatBytes } from '../../../src/utils/format';

const chipColors = [accent.orange, accent.blue, accent.purple, accent.green];

function utcClock(date = new Date()): string {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

function eventPillStatus(action: string): Status {
  if (action.includes('challenge')) {
    return 'challenge';
  }
  return action === 'block' ? 'block' : 'log';
}

export default function Home() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const [snapshot, setSnapshot] = useState<ZonesSnapshot | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((force: boolean) => {
    return fetchZonesSnapshot({ force })
      .then((zones) => {
        setSnapshot(zones);
        // Analytics are best-effort and load after the zones list.
        return fetchAnalyticsSnapshot(zones, { force })
          .then(setAnalytics)
          .catch(() => {});
      })
      .catch(() => {
        // Connection issues are reported per credential inside the snapshot;
        // a total failure keeps the previous state.
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const refresh = () => {
    setRefreshing(true);
    void load(true).finally(() => setRefreshing(false));
  };

  const scopedAccount = useMemo(
    () => snapshot?.accounts.find((account) => account.id === scope) ?? null,
    [snapshot, scope],
  );

  const aggregate = useMemo(() => {
    if (!analytics || !analytics.available) {
      return null;
    }
    return aggregateAnalytics(analytics, scope ?? undefined);
  }, [analytics, scope]);

  if (!snapshot) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.title')}
        </Text>
        <View style={styles.loading}>
          <ActivityIndicator color={accent.orange} />
        </View>
      </SafeAreaView>
    );
  }

  if (snapshot.connectionCount === 0) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.title')}
        </Text>
        <EmptyState
          Icon={Globe}
          title={t('home.emptyTitle')}
          subtitle={t('home.emptySubtitle')}
          actionLabel={t('common.connectAccount')}
          onAction={() => router.push('/connect')}
        />
      </SafeAreaView>
    );
  }

  const scopedZones = scope
    ? snapshot.zones.filter((zone) => zone.accountId === scope)
    : snapshot.zones;
  const healthy = snapshot.issues.length === 0;
  const cacheHitPct =
    aggregate && aggregate.bytes > 0
      ? Math.round((aggregate.cachedBytes / aggregate.bytes) * 100)
      : null;
  const events = (
    analytics?.events.filter((event) => !scope || event.accountId === scope) ??
    []
  ).slice(0, 3);

  const accountHealth = (accountId: string): string => {
    const zones = snapshot.zones.filter((zone) => zone.accountId === accountId);
    if (zones.length === 0) {
      return accent.gray;
    }
    return zones.every((zone) => zone.status === 'active' && !zone.paused)
      ? accent.green
      : accent.yellow;
  };

  const accountRequests = (accountId: string): number | null => {
    if (!analytics?.available) {
      return null;
    }
    return aggregateAnalytics(analytics, accountId).requests;
  };

  const accountPlan = (accountId: string): string | null =>
    snapshot.zones.find((zone) => zone.accountId === accountId)?.plan ?? null;

  const quickAccess = [
    {
      key: 'workers',
      title: t('home.quickWorkers'),
      sub: t('home.quickComputeSub'),
      Icon: Zap,
      color: accent.yellow,
      onPress: () => router.push('/(tabs)/(compute)'),
    },
    {
      key: 'dns',
      title: t('home.quickDns'),
      sub: t('home.quickZonesSub'),
      Icon: Server,
      color: accent.blue,
      onPress: () => router.push('/(tabs)/(zones)'),
    },
    {
      key: 'firewall',
      title: t('home.quickFirewall'),
      sub: aggregate
        ? t('home.quickFirewallSub', { count: compactNumber(aggregate.threats) })
        : t('common.comingSoon'),
      Icon: Shield,
      color: accent.red,
      onPress: undefined,
    },
    {
      key: 'analytics',
      title: t('home.quickAnalytics'),
      sub: t('home.quickAnalyticsSub'),
      Icon: BarChart2,
      color: accent.purple,
      onPress: undefined,
    },
  ];

  const management = [
    { key: 'alerts', title: t('home.mgmtAlerts'), sub: t('home.mgmtAlertsSub'), Icon: Bell, color: accent.red },
    { key: 'analytics', title: t('home.quickAnalytics'), sub: t('home.mgmtAnalyticsSub'), Icon: BarChart2, color: accent.purple },
    { key: 'lb', title: t('home.mgmtLb'), sub: t('home.mgmtLbSub'), Icon: Wifi, color: accent.blue },
    { key: 'audit', title: t('home.mgmtAudit'), sub: t('home.mgmtAuditSub'), Icon: FileText, color: accent.gray },
    { key: 'billing', title: t('home.mgmtBilling'), sub: t('home.mgmtBillingSub'), Icon: DollarSign, color: accent.green },
  ];

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.switchAccount')}
        onPress={() => setSheetOpen(true)}
        style={styles.accountBar}
        testID="home-account-bar"
      >
        <View style={styles.accountBarIcon}>
          <Layers color={foreground.onAccent} size={15} />
        </View>
        <View style={styles.accountBarCopy}>
          <Text style={[styles.accountBarCaption, { color: label(mode, 0.4) }]}>
            {t('home.managing')}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.accountBarName, { color: colors.text }]}
          >
            {scopedAccount ? scopedAccount.name : t('home.allAccounts')}
          </Text>
        </View>
        <Text style={[styles.accountBarCount, { color: label(mode, 0.45) }]}>
          {t('common.accountCount', { count: snapshot.accounts.length })}
        </Text>
        <ChevronsUpDown color={label(mode, 0.45)} size={14} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={refreshing}
            tintColor={accent.orange}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {scopedAccount ? scopedAccount.name : t('home.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
          {scopedAccount
            ? [
                accountPlan(scopedAccount.id),
                t('common.zoneCount', { count: scopedZones.length }),
              ]
                .filter(Boolean)
                .join(' · ')
            : `${t('common.accountCount', { count: snapshot.accounts.length })} · ${t('common.zoneCount', { count: snapshot.zones.length })}`}
        </Text>

        <View
          style={[
            styles.banner,
            {
              backgroundColor: healthy
                ? tint(accent.green, '1f')
                : tint(accent.yellow, '1f'),
            },
          ]}
        >
          <View
            style={[
              styles.bannerDot,
              { backgroundColor: healthy ? accent.green : accent.yellow },
            ]}
          />
          <Text
            style={[
              styles.bannerText,
              { color: healthy ? accent.green : accent.yellow },
            ]}
          >
            {healthy
              ? t('home.allOperational')
              : t('home.needsAttention', { count: snapshot.issues.length })}
          </Text>
          <Text style={[styles.bannerTime, { color: label(mode, 0.4) }]}>
            {utcClock()}
          </Text>
        </View>
        {snapshot.issues.map((issue) => (
          <Text
            key={issue.connectionId}
            style={[styles.issue, { color: label(mode, 0.45) }]}
          >
            {issue.label}: {cloudflareErrorMessage(issue.cause)}
          </Text>
        ))}

        <View style={styles.tileRow}>
          <MetricTile
            Icon={Activity}
            color={accent.orange}
            label={t('home.metricRequests')}
            value={aggregate ? compactNumber(aggregate.requests) : '—'}
            sub={t('home.metricSub24h')}
          />
          <MetricTile
            Icon={Shield}
            color={accent.red}
            label={t('home.metricThreats')}
            value={aggregate ? compactNumber(aggregate.threats) : '—'}
            sub={t('home.metricSub24h')}
          />
        </View>
        <View style={styles.tileRow}>
          <MetricTile
            Icon={HardDrive}
            color={accent.blue}
            label={t('home.metricBandwidth')}
            value={aggregate ? formatBytes(aggregate.cachedBytes) : '—'}
            sub={
              cacheHitPct !== null
                ? t('home.cacheHitSub', { pct: cacheHitPct })
                : t('home.metricSub24h')
            }
          />
          <MetricTile
            Icon={DollarSign}
            color={accent.green}
            label={t('home.metricSpend')}
            value="—"
            sub={t('home.spendSub')}
          />
        </View>

        {!scope && (
          <>
            <SectionLabel>{t('home.sectionAccounts')}</SectionLabel>
            <Card>
              {snapshot.accounts.map((account, index) => {
                const requests = accountRequests(account.id);
                const plan = accountPlan(account.id);
                const subParts = [
                  plan,
                  t('common.zoneCount', { count: account.zoneCount }),
                  requests !== null
                    ? t('home.requestsShort', {
                        value: compactNumber(requests),
                      })
                    : null,
                ].filter(Boolean);
                return (
                  <ListRow
                    key={account.id}
                    last={index === snapshot.accounts.length - 1}
                    onPress={() => setScope(account.id)}
                    right={
                      requests !== null ? (
                        <Text style={styles.accountRequests}>
                          {compactNumber(requests)}
                        </Text>
                      ) : undefined
                    }
                    left={
                      <View style={styles.accountRow}>
                        <AccountChip
                          color={chipColors[index % chipColors.length]}
                          name={account.name}
                          size={30}
                        />
                        <View style={styles.accountCopy}>
                          <View style={styles.accountNameRow}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.accountName,
                                { color: colors.text },
                              ]}
                            >
                              {account.name}
                            </Text>
                            <View
                              style={[
                                styles.accountDot,
                                { backgroundColor: accountHealth(account.id) },
                              ]}
                            />
                          </View>
                          <Text
                            style={[
                              styles.accountSub,
                              { color: label(mode, 0.4) },
                            ]}
                          >
                            {subParts.join(' · ')}
                          </Text>
                        </View>
                      </View>
                    }
                  />
                );
              })}
            </Card>
          </>
        )}

        {aggregate && aggregate.series.length >= 2 ? (
          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>
              {t('home.chartTitle')}
            </Text>
            <Text style={[styles.chartSub, { color: label(mode, 0.4) }]}>
              {scopedAccount
                ? t('home.chartSubAccount', { name: scopedAccount.name })
                : t('home.chartSubAll')}
            </Text>
            <AreaChart color={accent.orange} data={aggregate.series} />
          </View>
        ) : null}

        <SectionLabel>{t('home.sectionQuickAccess')}</SectionLabel>
        <Card>
          {quickAccess.map((item, index) => (
            <ListRow
              key={item.key}
              last={index === quickAccess.length - 1}
              onPress={item.onPress}
              left={
                <View style={styles.accountRow}>
                  <View
                    style={[
                      styles.quickIcon,
                      { backgroundColor: tint(item.color, '22') },
                    ]}
                  >
                    <item.Icon
                      accessibilityElementsHidden
                      color={item.color}
                      size={16}
                    />
                  </View>
                  <View style={styles.accountCopy}>
                    <Text style={[styles.accountName, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.accountSub, { color: label(mode, 0.45) }]}
                    >
                      {item.sub}
                    </Text>
                  </View>
                </View>
              }
            />
          ))}
        </Card>

        <SectionLabel>{t('home.sectionManagement')}</SectionLabel>
        <Card>
          {management.map((item, index) => (
            <ListRow
              key={item.key}
              last={index === management.length - 1}
              left={
                <View style={styles.accountRow}>
                  <View
                    style={[
                      styles.quickIcon,
                      { backgroundColor: tint(item.color, '22') },
                    ]}
                  >
                    <item.Icon
                      accessibilityElementsHidden
                      color={item.color}
                      size={16}
                    />
                  </View>
                  <View style={styles.accountCopy}>
                    <Text style={[styles.accountName, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.accountSub, { color: label(mode, 0.45) }]}
                    >
                      {item.sub}
                    </Text>
                  </View>
                </View>
              }
            />
          ))}
        </Card>

        {analytics?.available ? (
          <>
            <SectionLabel>{t('home.sectionRecentEvents')}</SectionLabel>
            <Card>
              {events.length > 0 ? (
                events.map((event, index) => {
                  const zone = snapshot.zones.find(
                    (item) => item.id === event.zoneId,
                  );
                  return (
                    <ListRow
                      key={`${event.zoneId}-${event.datetime}-${index}`}
                      last={index === events.length - 1}
                      testID={`home-event-${index}`}
                      onPress={
                        zone
                          ? () =>
                              router.push({
                                pathname: '/(tabs)/(zones)/[zoneId]/firewall',
                                params: {
                                  zoneId: zone.id,
                                  connectionId: zone.connectionId,
                                  name: zone.name,
                                },
                              })
                          : undefined
                      }
                      left={
                        <View style={styles.accountRow}>
                          <Pill status={eventPillStatus(event.action)} />
                          <View style={styles.accountCopy}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.accountName,
                                { color: colors.text },
                              ]}
                            >
                              {event.ruleId || event.action}
                            </Text>
                            <Text
                              style={[
                                styles.accountSub,
                                { color: label(mode, 0.4) },
                              ]}
                            >
                              {[
                                event.clientIP,
                                event.country,
                                event.datetime
                                  ? utcClock(new Date(event.datetime)).replace(
                                      ' UTC',
                                      '',
                                    )
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                        </View>
                      }
                    />
                  );
                })
              ) : (
                <ListRow
                  chevron={false}
                  last
                  left={
                    <Text
                      style={[styles.accountSub, { color: label(mode, 0.4) }]}
                    >
                      {t('firewall.noEvents')}
                    </Text>
                  }
                />
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
        transparent
        visible={sheetOpen}
      >
        <Pressable
          onPress={() => setSheetOpen(false)}
          style={styles.sheetBackdrop}
          testID="home-account-sheet-backdrop"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, { backgroundColor: colors.surface }]}
          >
            <View
              style={[styles.sheetHandle, { backgroundColor: label(mode, 0.2) }]}
            />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {t('home.switchAccount')}
            </Text>
            <ListRow
              chevron={false}
              onPress={() => {
                setScope(null);
                setSheetOpen(false);
              }}
              right={
                scope === null ? (
                  <Check color={accent.orange} size={16} />
                ) : undefined
              }
              testID="home-scope-all"
              left={
                <View style={styles.accountRow}>
                  <View style={styles.accountBarIcon}>
                    <Layers color={foreground.onAccent} size={15} />
                  </View>
                  <View style={styles.accountCopy}>
                    <Text style={[styles.accountName, { color: colors.text }]}>
                      {t('home.allAccounts')}
                    </Text>
                    <Text
                      style={[styles.accountSub, { color: label(mode, 0.4) }]}
                    >
                      {t('common.accountCount', {
                        count: snapshot.accounts.length,
                      })}
                    </Text>
                  </View>
                </View>
              }
            />
            {snapshot.accounts.map((account, index) => (
              <ListRow
                chevron={false}
                key={account.id}
                last={index === snapshot.accounts.length - 1}
                onPress={() => {
                  setScope(account.id);
                  setSheetOpen(false);
                }}
                right={
                  scope === account.id ? (
                    <Check color={accent.orange} size={16} />
                  ) : undefined
                }
                left={
                  <View style={styles.accountRow}>
                    <AccountChip
                      color={chipColors[index % chipColors.length]}
                      name={account.name}
                      size={30}
                    />
                    <View style={styles.accountCopy}>
                      <Text
                        numberOfLines={1}
                        style={[styles.accountName, { color: colors.text }]}
                      >
                        {account.name}
                      </Text>
                      <Text
                        style={[styles.accountSub, { color: label(mode, 0.4) }]}
                      >
                        {t('common.zoneCount', { count: account.zoneCount })}
                      </Text>
                    </View>
                  </View>
                }
              />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  accountBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  accountBarCaption: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  accountBarCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountBarCount: {
    fontSize: 13,
  },
  accountBarIcon: {
    alignItems: 'center',
    backgroundColor: accent.orange,
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  accountBarName: {
    fontSize: 17,
    fontWeight: '600',
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  accountName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  accountNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  accountRequests: {
    color: accent.orange,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  accountSub: {
    fontSize: 13,
    marginTop: 2,
  },
  banner: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  bannerTime: {
    fontSize: 11,
  },
  chartCard: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
  },
  chartSub: {
    fontSize: 12,
    marginBottom: 12,
    marginTop: 2,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    paddingBottom: 32,
  },
  issue: {
    fontSize: 13,
    marginTop: 6,
    paddingHorizontal: 20,
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  quickIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  safeArea: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 8,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetHandle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 5,
    marginBottom: 8,
    width: 36,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 3,
    paddingHorizontal: 16,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
});
