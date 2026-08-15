import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, Globe, Layers, Zap } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  fetchComputeSnapshot,
  invalidateComputeSnapshot,
  type ComputeSnapshot,
} from '@/src/cloudflare/accountResources';
import {
  fetchWorkerMetrics,
  type WorkerMetrics,
} from '@/src/cloudflare/analytics';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import {
  Card,
  EmptyState,
  ListRow,
  MetricTile,
  Pill,
  SectionLabel,
  SegmentedControl,
  type Status,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label, tint } from '@/src/theme/tokens';
import { compactNumber, relativeTime } from '@/src/utils/format';

type ComputeSegment = 'workers' | 'pages';

function pagesPillStatus(
  status: ComputeSnapshot['pages'][number]['deployStatus'],
): Status | null {
  switch (status) {
    case 'success':
      return 'active';
    case 'building':
    case 'unknown':
      return 'pending';
    case 'failure':
      return 'error';
    default:
      return null;
  }
}

export default function Compute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const [snapshot, setSnapshot] = useState<ComputeSnapshot | null>(null);
  const [metrics, setMetrics] = useState<Map<string, Map<string, WorkerMetrics>>>(
    new Map(),
  );
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [segment, setSegment] = useState<ComputeSegment>('workers');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((force: boolean) => {
    return fetchComputeSnapshot({ force })
      .then(async (next) => {
        setSnapshot(next);
        const collected = new Map<string, Map<string, WorkerMetrics>>();
        await Promise.all(
          next.accounts.map(async (account) => {
            try {
              const bearer = await getBearerForConnection(
                account.connectionId,
              );
              collected.set(
                account.accountId,
                await fetchWorkerMetrics(bearer, account.accountId),
              );
            } catch {
              // Metrics are best-effort; the list still renders.
            }
          }),
        );
        setMetrics(collected);
        setMetricsLoaded(collected.size > 0);
      })
      .catch(() => {
        // Keep the previous snapshot when a refresh fails outright.
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const refresh = () => {
    setRefreshing(true);
    invalidateComputeSnapshot();
    void load(true).finally(() => setRefreshing(false));
  };

  const showAccountName = (snapshot?.accounts.length ?? 0) > 1;

  const workerTotals = useMemo(() => {
    if (!snapshot || !metricsLoaded) {
      return null;
    }
    let errors = 0;
    for (const worker of snapshot.workers) {
      errors += metrics.get(worker.accountId)?.get(worker.id)?.errors ?? 0;
    }
    return { errors };
  }, [snapshot, metrics, metricsLoaded]);

  if (!snapshot) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.title, styles.titleStandalone, { color: colors.text }]}>
          {t('compute.title')}
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
        <Text style={[styles.title, styles.titleStandalone, { color: colors.text }]}>
          {t('compute.title')}
        </Text>
        <EmptyState
          Icon={Zap}
          title={t('compute.emptyTitle')}
          subtitle={t('compute.emptySubtitle')}
          actionLabel={t('common.connectAccount')}
          onAction={() => router.push('/connect')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
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
        <Text style={[styles.title, styles.titleStandalone, { color: colors.text }]}>
          {t('compute.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
          {t('compute.subtitle')}
        </Text>

        {snapshot.issues.map((issue) => (
          <Text
            key={issue.connectionId + issue.label}
            style={[styles.issue, { color: accent.yellow }]}
          >
            {issue.label}: {cloudflareErrorMessage(issue.cause)}
          </Text>
        ))}

        <View style={styles.segmentWrap}>
          <SegmentedControl
            onChange={setSegment}
            segments={[
              { id: 'workers', label: t('compute.segWorkers') },
              { id: 'pages', label: t('compute.segPages') },
            ]}
            selected={segment}
            testIDPrefix="compute-segment"
          />
        </View>

        {segment === 'workers' ? (
          <>
            <View style={styles.tileRow}>
              <MetricTile
                Icon={Zap}
                color={accent.green}
                label={t('compute.active')}
                value={String(snapshot.workers.length)}
              />
              <MetricTile
                Icon={AlertTriangle}
                color={accent.red}
                label={t('compute.errors')}
                value={
                  workerTotals ? compactNumber(workerTotals.errors) : '—'
                }
                sub={t('storage.last24h')}
              />
              <MetricTile
                Icon={Layers}
                color={accent.blue}
                label={t('compute.total')}
                value={String(snapshot.workers.length)}
              />
            </View>
            <SectionLabel>
              {t('compute.workersCount', { count: snapshot.workers.length })}
            </SectionLabel>
            {snapshot.workers.length === 0 ? (
              <Text style={[styles.empty, { color: label(mode, 0.4) }]}>
                {t('compute.noWorkers')}
              </Text>
            ) : (
              <Card>
                {snapshot.workers.map((worker, index) => {
                  const workerMetrics = metrics
                    .get(worker.accountId)
                    ?.get(worker.id);
                  const hasErrors = (workerMetrics?.errors ?? 0) > 0;
                  const sub = [
                    showAccountName ? worker.accountName : null,
                    worker.modifiedOn
                      ? t('compute.updated', {
                          when: relativeTime(worker.modifiedOn, t),
                        })
                      : null,
                    workerMetrics
                      ? t('compute.requestsPerDay', {
                          value: compactNumber(workerMetrics.requests),
                        })
                      : null,
                    workerMetrics?.cpuP50Ms != null
                      ? t('compute.cpuMs', {
                          value: workerMetrics.cpuP50Ms.toFixed(1),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ListRow
                      key={`${worker.accountId}-${worker.id}`}
                      last={index === snapshot.workers.length - 1}
                      testID={`compute-worker-${worker.id}`}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/(compute)/worker/[script]',
                          params: {
                            script: worker.id,
                            accountId: worker.accountId,
                            connectionId: worker.connectionId,
                            accountName: worker.accountName,
                            ...(worker.modifiedOn
                              ? { modifiedOn: worker.modifiedOn }
                              : {}),
                            ...(worker.createdOn
                              ? { createdOn: worker.createdOn }
                              : {}),
                          },
                        })
                      }
                      left={
                        <View style={styles.row}>
                          <View
                            style={[
                              styles.iconBadge,
                              { backgroundColor: tint(accent.orange, '22') },
                            ]}
                          >
                            <Zap color={accent.orange} size={15} />
                          </View>
                          <View style={styles.copy}>
                            <View style={styles.titleLine}>
                              <Text
                                numberOfLines={1}
                                style={[styles.mono, { color: colors.text }]}
                              >
                                {worker.id}
                              </Text>
                              <Pill status={hasErrors ? 'error' : 'active'} />
                            </View>
                            {sub ? (
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.sub,
                                  { color: label(mode, 0.4) },
                                ]}
                              >
                                {sub}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      }
                    />
                  );
                })}
              </Card>
            )}
          </>
        ) : null}

        {segment === 'pages' ? (
          <>
            <SectionLabel>
              {t('compute.projectsCount', { count: snapshot.pages.length })}
            </SectionLabel>
            {snapshot.pages.length === 0 ? (
              <Text style={[styles.empty, { color: label(mode, 0.4) }]}>
                {t('compute.noPages')}
              </Text>
            ) : (
              <Card>
                {snapshot.pages.map((project, index) => {
                  const pillStatus = pagesPillStatus(project.deployStatus);
                  const domainLine = [
                    showAccountName ? project.accountName : null,
                    project.domain || null,
                    project.framework || null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const deployLine = [
                    project.deployBranch,
                    project.deployCommit,
                    project.deployedAt
                      ? relativeTime(project.deployedAt, t)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ListRow
                      key={`${project.accountId}-${project.name}`}
                      last={index === snapshot.pages.length - 1}
                      testID={`compute-pages-${project.name}`}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/(compute)/pages/[project]',
                          params: {
                            project: project.name,
                            accountId: project.accountId,
                            connectionId: project.connectionId,
                            accountName: project.accountName,
                            ...(project.domain
                              ? { domain: project.domain }
                              : {}),
                            ...(project.framework
                              ? { framework: project.framework }
                              : {}),
                            ...(project.productionBranch
                              ? { productionBranch: project.productionBranch }
                              : {}),
                            ...(project.productionScriptName
                              ? {
                                  productionScriptName:
                                    project.productionScriptName,
                                }
                              : {}),
                          },
                        })
                      }
                      left={
                        <View style={styles.row}>
                          <View
                            style={[
                              styles.iconBadge,
                              { backgroundColor: tint(accent.blue, '22') },
                            ]}
                          >
                            <Globe color={accent.blue} size={15} />
                          </View>
                          <View style={styles.copy}>
                            <View style={styles.titleLine}>
                              <Text
                                numberOfLines={1}
                                style={[styles.name, { color: colors.text }]}
                              >
                                {project.name}
                              </Text>
                              {pillStatus ? <Pill status={pillStatus} /> : null}
                            </View>
                            {domainLine ? (
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.sub,
                                  { color: label(mode, 0.4) },
                                ]}
                              >
                                {domainLine}
                              </Text>
                            ) : null}
                            {deployLine ? (
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.subMono,
                                  { color: label(mode, 0.35) },
                                ]}
                              >
                                {deployLine}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      }
                    />
                  );
                })}
              </Card>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  empty: {
    fontSize: 15,
    marginTop: 12,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  issue: {
    fontSize: 13,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  mono: {
    flexShrink: 1,
    fontFamily: 'Menlo',
    fontSize: 14,
    fontWeight: '600',
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  safeArea: {
    flex: 1,
  },
  segmentWrap: {
    marginTop: 14,
  },
  sub: {
    fontSize: 13,
    marginTop: 2,
  },
  subMono: {
    fontFamily: 'Menlo',
    fontSize: 11,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 3,
    paddingHorizontal: 16,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 1,
  },
  titleStandalone: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
