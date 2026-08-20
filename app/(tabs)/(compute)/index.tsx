import { memo, useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, Globe, Layers, Zap } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  fetchComputeSnapshot,
  getAccountBearer,
  invalidateComputeSnapshot,
  type ComputeSnapshot,
  type PagesProjectItem,
  type WorkerItem,
} from '@/src/cloudflare/accountResources';
import {
  fetchWorkerMetrics,
  type WorkerMetrics,
} from '@/src/cloudflare/analytics';
import {
  CardRow,
  EmptyState,
  ListRow,
  MetricTile,
  Pill,
  ScopeBanner,
  SearchField,
  SectionLabel,
  SegmentedControl,
  type Status,
  InlineEmpty,
  ScreenSkeleton,
  useToast,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CollapsibleTitleContainer, CompactHeader, useCollapsibleTitle } from '@/src/components/CollapsibleTitle';
import { useTabBarInset } from '@/src/components/useTabBarInset';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAccountScope } from '@/src/state/accountScope';
import { haptics } from '@/src/utils/haptics';
import { showResourceMenu } from '@/src/utils/resourceMenu';
import { accent, fontFace, label, tint } from '@/src/theme/tokens';
import { compactNumber, relativeTime } from '@/src/utils/format';

type ComputeSegment = 'workers' | 'pages';
type ComputeListItem = WorkerItem | PagesProjectItem;
type AccountMetrics = Map<string, Map<string, WorkerMetrics>>;

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

const WorkerRow = memo(function WorkerRow({
  worker,
  workerMetrics,
  first,
  last,
  showAccountName,
  onOpen,
  onMenu,
}: {
  worker: WorkerItem;
  workerMetrics: WorkerMetrics | undefined;
  first: boolean;
  last: boolean;
  showAccountName: boolean;
  onOpen: (worker: WorkerItem) => void;
  onMenu: (worker: WorkerItem) => void;
}) {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const hasErrors = (workerMetrics?.errors ?? 0) > 0;
  const sub = [
    showAccountName ? worker.accountName : null,
    worker.modifiedOn
      ? t('compute.updated', { when: relativeTime(worker.modifiedOn, t) })
      : null,
    workerMetrics
      ? t('compute.requestsPerDay', {
          value: compactNumber(workerMetrics.requests),
        })
      : null,
    workerMetrics?.cpuP50Ms != null
      ? t('compute.cpuMs', { value: workerMetrics.cpuP50Ms.toFixed(1) })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <CardRow first={first} last={last}>
      <ListRow
        last={last}
        testID={`compute-worker-${worker.id}`}
        onLongPress={() => onMenu(worker)}
        onPress={() => onOpen(worker)}
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
                  style={[styles.sub, { color: label(mode, 0.4) }]}
                >
                  {sub}
                </Text>
              ) : null}
            </View>
          </View>
        }
      />
    </CardRow>
  );
});

const PagesRow = memo(function PagesRow({
  project,
  first,
  last,
  showAccountName,
  onOpen,
  onMenu,
}: {
  project: PagesProjectItem;
  first: boolean;
  last: boolean;
  showAccountName: boolean;
  onOpen: (project: PagesProjectItem) => void;
  onMenu: (project: PagesProjectItem) => void;
}) {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
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
    project.deployedAt ? relativeTime(project.deployedAt, t) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <CardRow first={first} last={last}>
      <ListRow
        last={last}
        testID={`compute-pages-${project.name}`}
        onLongPress={() => onMenu(project)}
        onPress={() => onOpen(project)}
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
                  style={[styles.sub, { color: label(mode, 0.4) }]}
                >
                  {domainLine}
                </Text>
              ) : null}
              {deployLine ? (
                <Text
                  numberOfLines={1}
                  style={[styles.subMono, { color: label(mode, 0.35) }]}
                >
                  {deployLine}
                </Text>
              ) : null}
            </View>
          </View>
        }
      />
    </CardRow>
  );
});

function workerMenu(
  worker: WorkerItem,
  t: TFunction,
  onCopied: () => void,
): void {
  showResourceMenu({
    title: worker.id,
    copyLabel: t('common.copyName'),
    copyValue: worker.id,
    dashboardPath: `${worker.accountId}/workers/services/view/${worker.id}`,
    t,
    onCopied,
  });
}

function pagesMenu(
  project: PagesProjectItem,
  t: TFunction,
  onCopied: () => void,
): void {
  showResourceMenu({
    title: project.name,
    copyLabel: t('common.copyName'),
    copyValue: project.name,
    dashboardPath: `${project.accountId}/pages/view/${project.name}`,
    t,
    onCopied,
  });
}

/** Reuses the previous map when no account's metrics actually changed. */
function sameMetrics(prev: AccountMetrics, next: AccountMetrics): boolean {
  if (prev.size !== next.size) {
    return false;
  }
  for (const [accountId, value] of next) {
    if (prev.get(accountId) !== value) {
      return false;
    }
  }
  return true;
}

export default function Compute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const bottomInset = useTabBarInset();
  const { scrollY, onScroll } = useCollapsibleTitle();
  const { showToast } = useToast();
  const { scope } = useAccountScope();
  const [snapshot, setSnapshot] = useState<ComputeSnapshot | null>(null);
  const [metrics, setMetrics] = useState<AccountMetrics>(new Map());
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [segment, setSegment] = useState<ComputeSegment>('workers');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((force: boolean) => {
    return fetchComputeSnapshot({ force })
      .then((next) => {
        setSnapshot(next);
        // Metrics are best-effort and finish in the background: neither the
        // first paint nor the pull-to-refresh spinner waits on GraphQL.
        const collected: AccountMetrics = new Map();
        void Promise.all(
          next.accounts.map(async (account) => {
            try {
              const bearer = await getAccountBearer(account.accountId);
              collected.set(
                account.accountId,
                await fetchWorkerMetrics(bearer, account.accountId, { force }),
              );
            } catch {
              // Metrics are best-effort; the list still renders.
            }
          }),
        ).then(() => {
          setMetrics((prev) =>
            sameMetrics(prev, collected) ? prev : collected,
          );
          setMetricsLoaded(collected.size > 0);
        });
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
    haptics.tap();
    setRefreshing(true);
    invalidateComputeSnapshot();
    void load(true).finally(() => setRefreshing(false));
  };

  const showAccountName = !scope && (snapshot?.accounts.length ?? 0) > 1;
  const scopedName =
    snapshot?.accounts.find((account) => account.accountId === scope)
      ?.accountName ?? null;

  const workers = useMemo(
    () =>
      scope
        ? (snapshot?.workers ?? []).filter((w) => w.accountId === scope)
        : snapshot?.workers ?? [],
    [snapshot, scope],
  );
  const pages = useMemo(
    () =>
      scope
        ? (snapshot?.pages ?? []).filter((p) => p.accountId === scope)
        : snapshot?.pages ?? [],
    [snapshot, scope],
  );

  const needle = query.trim().toLowerCase();
  const visibleWorkers = useMemo(
    () =>
      needle
        ? workers.filter(
            (worker) =>
              worker.id.toLowerCase().includes(needle) ||
              worker.accountName.toLowerCase().includes(needle),
          )
        : workers,
    [workers, needle],
  );
  const visiblePages = useMemo(
    () =>
      needle
        ? pages.filter(
            (project) =>
              project.name.toLowerCase().includes(needle) ||
              (project.domain ?? '').toLowerCase().includes(needle) ||
              project.accountName.toLowerCase().includes(needle),
          )
        : pages,
    [pages, needle],
  );

  const workerTotals = useMemo(() => {
    if (!snapshot || !metricsLoaded) {
      return null;
    }
    let errors = 0;
    for (const worker of workers) {
      errors += metrics.get(worker.accountId)?.get(worker.id)?.errors ?? 0;
    }
    return { errors };
  }, [snapshot, workers, metrics, metricsLoaded]);

  const openWorker = useCallback(
    (worker: WorkerItem) => {
      router.push({
        pathname: '/(tabs)/(compute)/worker/[script]',
        params: {
          script: worker.id,
          accountId: worker.accountId,
          connectionId: worker.connectionId,
          accountName: worker.accountName,
          ...(worker.modifiedOn ? { modifiedOn: worker.modifiedOn } : {}),
          ...(worker.createdOn ? { createdOn: worker.createdOn } : {}),
        },
      });
    },
    [router],
  );

  const openPages = useCallback(
    (project: PagesProjectItem) => {
      router.push({
        pathname: '/(tabs)/(compute)/pages/[project]',
        params: {
          project: project.name,
          accountId: project.accountId,
          connectionId: project.connectionId,
          accountName: project.accountName,
          ...(project.domain ? { domain: project.domain } : {}),
          ...(project.framework ? { framework: project.framework } : {}),
          ...(project.productionBranch
            ? { productionBranch: project.productionBranch }
            : {}),
          ...(project.productionScriptName
            ? { productionScriptName: project.productionScriptName }
            : {}),
        },
      });
    },
    [router],
  );

  const onCopied = useCallback(
    () => showToast(t('common.copied')),
    [showToast, t],
  );
  const onWorkerMenu = useCallback(
    (worker: WorkerItem) => workerMenu(worker, t, onCopied),
    [t, onCopied],
  );
  const onPagesMenu = useCallback(
    (project: PagesProjectItem) => pagesMenu(project, t, onCopied),
    [t, onCopied],
  );

  const items: ComputeListItem[] =
    segment === 'workers' ? visibleWorkers : visiblePages;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ComputeListItem>) => {
      if ('id' in item) {
        return (
          <WorkerRow
            worker={item}
            workerMetrics={metrics.get(item.accountId)?.get(item.id)}
            first={index === 0}
            last={index === visibleWorkers.length - 1}
            showAccountName={showAccountName}
            onOpen={openWorker}
            onMenu={onWorkerMenu}
          />
        );
      }
      return (
        <PagesRow
          project={item}
          first={index === 0}
          last={index === visiblePages.length - 1}
          showAccountName={showAccountName}
          onOpen={openPages}
          onMenu={onPagesMenu}
        />
      );
    },
    [
      metrics,
      visibleWorkers.length,
      visiblePages.length,
      showAccountName,
      openWorker,
      onWorkerMenu,
      openPages,
      onPagesMenu,
    ],
  );

  const keyExtractor = useCallback(
    (item: ComputeListItem) =>
      'id' in item
        ? `${item.accountId}-${item.id}`
        : `${item.accountId}-${item.name}`,
    [],
  );

  if (!snapshot) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.title, styles.titleStandalone, { color: colors.text }]}>
          {t('compute.title')}
        </Text>
        <ScreenSkeleton testID="screen-skeleton" />
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

  const header = (
    <>
      <Text style={[styles.title, styles.titleStandalone, { color: colors.text }]}>
        {t('compute.title')}
      </Text>
      <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
        {t('compute.subtitle')}
      </Text>
      <ScopeBanner name={scopedName} />

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

      <SearchField
        accessibilityLabel={t('compute.searchA11y')}
        onChange={setQuery}
        placeholder={
          segment === 'workers'
            ? t('compute.searchWorkers')
            : t('compute.searchPages')
        }
        testID="compute-search"
        value={query}
      />

      {segment === 'workers' ? (
        <>
          <View style={styles.tileRow}>
            <MetricTile
              Icon={Zap}
              color={accent.green}
              label={t('compute.active')}
              value={String(workers.length)}
            />
            <MetricTile
              Icon={AlertTriangle}
              color={accent.red}
              label={t('compute.errors')}
              value={workerTotals ? compactNumber(workerTotals.errors) : '—'}
              sub={t('storage.last24h')}
            />
            <MetricTile
              Icon={Layers}
              color={accent.blue}
              label={t('compute.total')}
              value={String(workers.length)}
            />
          </View>
          <SectionLabel>
            {t('compute.workersCount', { count: visibleWorkers.length })}
          </SectionLabel>
        </>
      ) : (
        <SectionLabel>
          {t('compute.projectsCount', { count: visiblePages.length })}
        </SectionLabel>
      )}
    </>
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <CollapsibleTitleContainer>
        <CompactHeader scrollY={scrollY} title={t('compute.title')} />
        <Animated.FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <InlineEmpty>
              {needle
                ? t('common.noMatch', { query: query.trim() })
                : t(
                    segment === 'workers'
                      ? 'compute.noWorkers'
                      : 'compute.noPages',
                  )}
            </InlineEmpty>
          }
          onScroll={onScroll}
          scrollEventThrottle={16}
          entering={FadeInDown.duration(260)}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomInset },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              onRefresh={refresh}
              refreshing={refreshing}
              tintColor={accent.orange}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      </CollapsibleTitleContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {},
  copy: {
    flex: 1,
    minWidth: 0,
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  issue: {
    ...fontFace('subhead'),
    marginTop: 8,
    paddingHorizontal: 16,
  },
  mono: {
    ...fontFace('bodySmall', '600'),
    flexShrink: 1,
    fontFamily: 'Menlo',
  },
  name: {
    ...fontFace('bodyLarge', '500'),
    flexShrink: 1,
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
    ...fontFace('subhead'),
    marginTop: 2,
  },
  subMono: {
    ...fontFace('caption'),
    fontFamily: 'Menlo',
    marginTop: 2,
  },
  subtitle: {
    ...fontFace('body'),
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
    ...fontFace('display'),
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
