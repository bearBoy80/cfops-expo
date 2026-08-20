import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Archive, Database, HardDrive, KeyRound, Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  createD1Database,
  createKvNamespace,
  createR2Bucket,
} from '@/src/cloudflare/api';
import {
  fetchStorageSnapshot,
  invalidateStorageSnapshot,
  type D1DatabaseItem,
  type KvNamespaceItem,
  type R2BucketItem,
  type StorageSnapshot,
} from '@/src/cloudflare/accountResources';
import {
  fetchStorageMetrics,
  type D1DatabaseMetrics,
  type KvNamespaceMetrics,
  type R2BucketMetrics,
  type StorageMetrics,
} from '@/src/cloudflare/analytics';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import {
  CardRow,
  EmptyState,
  ListRow,
  MetricTile,
  PermissionNotice,
  ScopeBanner,
  SearchField,
  SectionLabel,
  SegmentedControl,
  useToast,
  InlineEmpty,
  ScreenSkeleton,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CollapsibleTitleContainer, CompactHeader, useCollapsibleTitle } from '@/src/components/CollapsibleTitle';
import { useTabBarInset } from '@/src/components/useTabBarInset';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAccountScope } from '@/src/state/accountScope';
import { haptics } from '@/src/utils/haptics';
import { showResourceMenu } from '@/src/utils/resourceMenu';
import {
  accent,
  fontFace,
  foreground,
  label,
  tint,
} from '@/src/theme/tokens';
import { compactNumber, formatBytes } from '@/src/utils/format';

type StorageSegment = 'r2' | 'kv' | 'd1';
type StorageListItem = R2BucketItem | KvNamespaceItem | D1DatabaseItem;

const R2_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const D1_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

/** '' means Cloudflare picks the location ("Auto"). */
const R2_LOCATIONS = ['', 'wnam', 'enam', 'weur', 'eeur', 'apac'] as const;

interface CreatorState {
  kind: StorageSegment;
  accountId: string;
  name: string;
  location: string;
}

const R2Row = memo(function R2Row({
  bucket,
  bucketMetrics,
  first,
  last,
  showAccountName,
  onOpen,
  onMenu,
}: {
  bucket: R2BucketItem;
  bucketMetrics: R2BucketMetrics | undefined;
  first: boolean;
  last: boolean;
  showAccountName: boolean;
  onOpen: (bucket: R2BucketItem) => void;
  onMenu: (bucket: R2BucketItem) => void;
}) {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const sub = [
    showAccountName ? bucket.accountName : null,
    bucket.location ? bucket.location.toUpperCase() : null,
    bucketMetrics
      ? t('storage.objectsCount', { count: bucketMetrics.objectCount })
      : null,
    bucketMetrics ? formatBytes(bucketMetrics.payloadSize) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <CardRow first={first} last={last}>
      <ListRow
        last={last}
        testID={`storage-bucket-${bucket.name}`}
        onLongPress={() => onMenu(bucket)}
        onPress={() => onOpen(bucket)}
        left={
          <View style={styles.row}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: tint(accent.orange, '22') },
              ]}
            >
              <HardDrive color={accent.orange} size={15} />
            </View>
            <View style={styles.copy}>
              <Text
                numberOfLines={1}
                style={[styles.name, { color: colors.text }]}
              >
                {bucket.name}
              </Text>
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

const KvRow = memo(function KvRow({
  namespace,
  kvMetrics,
  first,
  last,
  showAccountName,
  onOpen,
}: {
  namespace: KvNamespaceItem;
  kvMetrics: KvNamespaceMetrics | undefined;
  first: boolean;
  last: boolean;
  showAccountName: boolean;
  onOpen: (namespace: KvNamespaceItem) => void;
}) {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const sub = [
    showAccountName ? namespace.accountName : null,
    kvMetrics ? t('storage.keysCount', { count: kvMetrics.keyCount }) : null,
    kvMetrics ? formatBytes(kvMetrics.byteCount) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <CardRow first={first} last={last}>
      <ListRow
        last={last}
        testID={`storage-kv-${namespace.id}`}
        onPress={() => onOpen(namespace)}
        right={
          kvMetrics ? (
            <Text style={[styles.ops, { color: label(mode, 0.4) }]}>
              {t('storage.reads', { value: compactNumber(kvMetrics.reads) })}{' '}
              {t('storage.writes', { value: compactNumber(kvMetrics.writes) })}
            </Text>
          ) : undefined
        }
        left={
          <View style={styles.row}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: tint(accent.blue, '22') },
              ]}
            >
              <KeyRound color={accent.blue} size={15} />
            </View>
            <View style={styles.copy}>
              <Text
                numberOfLines={1}
                style={[styles.mono, { color: colors.text }]}
              >
                {namespace.title}
              </Text>
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

const D1Row = memo(function D1Row({
  database,
  d1Metrics,
  first,
  last,
  showAccountName,
  onOpen,
}: {
  database: D1DatabaseItem;
  d1Metrics: D1DatabaseMetrics | undefined;
  first: boolean;
  last: boolean;
  showAccountName: boolean;
  onOpen: (database: D1DatabaseItem) => void;
}) {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const sub = [
    showAccountName ? database.accountName : null,
    database.fileSize !== null ? formatBytes(database.fileSize) : null,
    database.numTables !== null
      ? t('storage.tablesCount', { count: database.numTables })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <CardRow first={first} last={last}>
      <ListRow
        last={last}
        testID={`storage-d1-${database.uuid}`}
        onPress={() => onOpen(database)}
        right={
          d1Metrics ? (
            <Text style={[styles.ops, { color: label(mode, 0.4) }]}>
              {t('storage.reads', {
                value: compactNumber(d1Metrics.readQueries),
              })}{' '}
              {t('storage.writes', {
                value: compactNumber(d1Metrics.writeQueries),
              })}
            </Text>
          ) : undefined
        }
        left={
          <View style={styles.row}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: tint(accent.purple, '22') },
              ]}
            >
              <Database color={accent.purple} size={15} />
            </View>
            <View style={styles.copy}>
              <Text
                numberOfLines={1}
                style={[styles.name, { color: colors.text }]}
              >
                {database.name}
              </Text>
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

function bucketMenu(
  bucket: R2BucketItem,
  t: TFunction,
  onCopied: () => void,
): void {
  showResourceMenu({
    title: bucket.name,
    copyLabel: t('common.copyName'),
    copyValue: bucket.name,
    dashboardPath: `${bucket.accountId}/r2/default/buckets/${bucket.name}`,
    t,
    onCopied,
  });
}

/** Reuses the previous map when no account's metrics actually changed. */
function sameMetrics(
  prev: Map<string, StorageMetrics>,
  next: Map<string, StorageMetrics>,
): boolean {
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

export default function Storage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const bottomInset = useTabBarInset();
  const { scrollY, onScroll } = useCollapsibleTitle();
  const { showToast } = useToast();
  const { scope } = useAccountScope();
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [metrics, setMetrics] = useState<Map<string, StorageMetrics>>(
    new Map(),
  );
  const [segment, setSegment] = useState<StorageSegment>('r2');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [creator, setCreator] = useState<CreatorState | null>(null);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback((force: boolean) => {
    return fetchStorageSnapshot({ force })
      .then((next) => {
        setSnapshot(next);
        // Metrics are best-effort and finish in the background so the
        // pull-to-refresh spinner never waits on GraphQL; missing data
        // renders as "—".
        const collected = new Map<string, StorageMetrics>();
        void Promise.all(
          next.accounts.map(async (account) => {
            try {
              const bearer = await getBearerForConnection(
                account.connectionId,
              );
              collected.set(
                account.accountId,
                await fetchStorageMetrics(bearer, account.accountId, {
                  force,
                }),
              );
            } catch {
              // Ignore: quota or permission failures leave metrics empty.
            }
          }),
        ).then(() => {
          setMetrics((prev) =>
            sameMetrics(prev, collected) ? prev : collected,
          );
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
    invalidateStorageSnapshot();
    void load(true).finally(() => setRefreshing(false));
  };

  const showAccountName = !scope && (snapshot?.accounts.length ?? 0) > 1;
  const scopedName =
    snapshot?.accounts.find((account) => account.accountId === scope)
      ?.accountName ?? null;

  const buckets = useMemo(
    () =>
      scope
        ? (snapshot?.buckets ?? []).filter((b) => b.accountId === scope)
        : snapshot?.buckets ?? [],
    [snapshot, scope],
  );
  const kvNamespaces = useMemo(
    () =>
      scope
        ? (snapshot?.kvNamespaces ?? []).filter((n) => n.accountId === scope)
        : snapshot?.kvNamespaces ?? [],
    [snapshot, scope],
  );
  const d1Databases = useMemo(
    () =>
      scope
        ? (snapshot?.d1Databases ?? []).filter((d) => d.accountId === scope)
        : snapshot?.d1Databases ?? [],
    [snapshot, scope],
  );

  const needle = query.trim().toLowerCase();
  const visibleBuckets = useMemo(
    () =>
      needle
        ? buckets.filter(
            (bucket) =>
              bucket.name.toLowerCase().includes(needle) ||
              bucket.accountName.toLowerCase().includes(needle),
          )
        : buckets,
    [buckets, needle],
  );
  const visibleKv = useMemo(
    () =>
      needle
        ? kvNamespaces.filter(
            (namespace) =>
              namespace.title.toLowerCase().includes(needle) ||
              namespace.accountName.toLowerCase().includes(needle),
          )
        : kvNamespaces,
    [kvNamespaces, needle],
  );
  const visibleD1 = useMemo(
    () =>
      needle
        ? d1Databases.filter(
            (database) =>
              database.name.toLowerCase().includes(needle) ||
              database.accountName.toLowerCase().includes(needle),
          )
        : d1Databases,
    [d1Databases, needle],
  );

  // Every account's metrics come back empty when the token cannot read
  // analytics, which is indistinguishable from idle resources without this.
  const metricsDenied = useMemo(
    () => [...metrics.values()].some((entry) => entry.permissionDenied),
    [metrics],
  );

  const r2Totals = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    let stored = 0;
    let objects = 0;
    let found = false;
    for (const bucket of buckets) {
      const bucketMetrics = metrics
        .get(bucket.accountId)
        ?.r2.get(bucket.name);
      if (bucketMetrics) {
        found = true;
        stored += bucketMetrics.payloadSize;
        objects += bucketMetrics.objectCount;
      }
    }
    return found ? { stored, objects } : null;
  }, [snapshot, buckets, metrics]);

  const openCreator = () => {
    const account =
      snapshot?.accounts.find((item) => item.accountId === scope) ??
      snapshot?.accounts[0];
    if (!account) {
      return;
    }
    setCreatorError(null);
    setCreator({
      kind: segment,
      accountId: account.accountId,
      name: '',
      location: '',
    });
  };

  const submitCreate = () => {
    if (!creator || !snapshot) {
      return;
    }
    const name = creator.name.trim();
    if (creator.kind === 'r2' && !R2_NAME_PATTERN.test(name)) {
      setCreatorError('storage.errBucketName');
      return;
    }
    if (creator.kind === 'kv' && name.length === 0) {
      setCreatorError('storage.errNamespaceName');
      return;
    }
    if (creator.kind === 'd1' && !D1_NAME_PATTERN.test(name)) {
      setCreatorError('storage.errDatabaseName');
      return;
    }
    const account = snapshot.accounts.find(
      (item) => item.accountId === creator.accountId,
    );
    if (!account) {
      return;
    }
    setCreating(true);
    void getBearerForConnection(account.connectionId)
      .then((bearer) => {
        if (creator.kind === 'r2') {
          return createR2Bucket(
            bearer,
            account.accountId,
            name,
            creator.location || undefined,
          );
        }
        if (creator.kind === 'kv') {
          return createKvNamespace(bearer, account.accountId, name);
        }
        return createD1Database(bearer, account.accountId, name);
      })
      .then(() => {
        setCreator(null);
        showToast(
          t(
            creator.kind === 'r2'
              ? 'storage.bucketCreated'
              : creator.kind === 'kv'
                ? 'storage.namespaceCreated'
                : 'storage.databaseCreated',
          ),
        );
        invalidateStorageSnapshot();
        void load(true);
      })
      .catch((cause) => {
        setCreatorError(cloudflareErrorMessage(cause));
      })
      .finally(() => setCreating(false));
  };

  const openBucket = useCallback(
    (bucket: R2BucketItem) => {
      router.push({
        pathname: '/(tabs)/(storage)/r2/[bucket]',
        params: {
          bucket: bucket.name,
          accountId: bucket.accountId,
          connectionId: bucket.connectionId,
          location: bucket.location,
        },
      });
    },
    [router],
  );

  const openKv = useCallback(
    (namespace: KvNamespaceItem) => {
      router.push({
        pathname: '/(tabs)/(storage)/kv/[namespace]',
        params: {
          namespace: namespace.id,
          accountId: namespace.accountId,
          connectionId: namespace.connectionId,
          accountName: namespace.accountName,
          title: namespace.title,
        },
      } as unknown as Href);
    },
    [router],
  );

  const openD1 = useCallback(
    (database: D1DatabaseItem) => {
      router.push({
        pathname: '/(tabs)/(storage)/d1/[database]',
        params: {
          database: database.uuid,
          accountId: database.accountId,
          connectionId: database.connectionId,
          accountName: database.accountName,
          name: database.name,
          ...(database.createdAt ? { createdAt: database.createdAt } : {}),
          ...(database.version ? { version: database.version } : {}),
        },
      } as unknown as Href);
    },
    [router],
  );

  const onCopied = useCallback(
    () => showToast(t('common.copied')),
    [showToast, t],
  );
  const onBucketMenu = useCallback(
    (bucket: R2BucketItem) => bucketMenu(bucket, t, onCopied),
    [t, onCopied],
  );

  const items: StorageListItem[] =
    segment === 'r2'
      ? visibleBuckets
      : segment === 'kv'
        ? visibleKv
        : visibleD1;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<StorageListItem>) => {
      const first = index === 0;
      if ('uuid' in item) {
        return (
          <D1Row
            database={item}
            d1Metrics={metrics.get(item.accountId)?.d1.get(item.uuid)}
            first={first}
            last={index === visibleD1.length - 1}
            showAccountName={showAccountName}
            onOpen={openD1}
          />
        );
      }
      if ('title' in item) {
        return (
          <KvRow
            namespace={item}
            kvMetrics={metrics.get(item.accountId)?.kv.get(item.id)}
            first={first}
            last={index === visibleKv.length - 1}
            showAccountName={showAccountName}
            onOpen={openKv}
          />
        );
      }
      return (
        <R2Row
          bucket={item}
          bucketMetrics={metrics.get(item.accountId)?.r2.get(item.name)}
          first={first}
          last={index === visibleBuckets.length - 1}
          showAccountName={showAccountName}
          onOpen={openBucket}
          onMenu={onBucketMenu}
        />
      );
    },
    [
      metrics,
      visibleBuckets.length,
      visibleKv.length,
      visibleD1.length,
      showAccountName,
      openBucket,
      onBucketMenu,
      openKv,
      openD1,
    ],
  );

  const keyExtractor = useCallback((item: StorageListItem) => {
    if ('uuid' in item) {
      return `${item.accountId}-${item.uuid}`;
    }
    if ('title' in item) {
      return `${item.accountId}-${item.id}`;
    }
    return `${item.accountId}-${item.name}`;
  }, []);

  if (!snapshot) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.title, styles.titleStandalone, { color: colors.text }]}>
          {t('storage.title')}
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
          {t('storage.title')}
        </Text>
        <EmptyState
          Icon={Database}
          title={t('storage.emptyTitle')}
          subtitle={t('storage.emptySubtitle')}
          actionLabel={t('common.connectAccount')}
          onAction={() => router.push('/connect')}
        />
      </SafeAreaView>
    );
  }

  const creatorAccount = creator
    ? snapshot.accounts.find((item) => item.accountId === creator.accountId)
    : null;

  const header = (
    <>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('storage.title')}
          </Text>
          <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
            {t('storage.subtitle')}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={
            segment === 'r2'
              ? t('storage.createBucket')
              : segment === 'kv'
                ? t('storage.createNamespace')
                : t('storage.createDatabase')
          }
          accessibilityRole="button"
          hitSlop={6}
          onPress={openCreator}
          style={styles.addButton}
          testID="storage-add"
        >
          <Plus color={foreground.onAccent} size={18} />
        </Pressable>
      </View>
      <ScopeBanner name={scopedName} />

      {snapshot.issues.map((issue) => (
        <Text
          key={issue.connectionId + issue.label}
          style={[styles.issue, { color: accent.yellow }]}
        >
          {issue.label}: {cloudflareErrorMessage(issue.cause)}
        </Text>
      ))}

      {metricsDenied ? (
        <PermissionNotice
          actionLabel={t('common.openApiTokens')}
          message={t('storage.metricsNoPerm')}
          onAction={() => {
            void Linking.openURL(
              'https://dash.cloudflare.com/profile/api-tokens',
            );
          }}
          title={t('common.permissionRequired')}
        />
      ) : null}

      <View style={styles.segmentWrap}>
        <SegmentedControl
          onChange={setSegment}
          segments={[
            { id: 'r2', label: t('storage.segR2') },
            { id: 'kv', label: t('storage.segKv') },
            { id: 'd1', label: t('storage.segD1') },
          ]}
          selected={segment}
          testIDPrefix="storage-segment"
        />
      </View>

      <SearchField
        accessibilityLabel={t('storage.searchA11y')}
        onChange={setQuery}
        placeholder={
          segment === 'r2'
            ? t('storage.searchR2')
            : segment === 'kv'
              ? t('storage.searchKv')
              : t('storage.searchD1')
        }
        testID="storage-search"
        value={query}
      />

      {segment === 'r2' ? (
        <>
          <View style={styles.tileRow}>
            <MetricTile
              Icon={HardDrive}
              color={accent.orange}
              label={t('storage.totalStored')}
              sub={t('storage.last24h')}
              value={r2Totals ? formatBytes(r2Totals.stored) : '—'}
            />
            <MetricTile
              Icon={Archive}
              color={accent.blue}
              label={t('storage.totalObjects')}
              sub={t('storage.last24h')}
              value={r2Totals ? compactNumber(r2Totals.objects) : '—'}
            />
          </View>
          <SectionLabel>
            {t('storage.bucketsCount', { count: visibleBuckets.length })}
          </SectionLabel>
        </>
      ) : segment === 'kv' ? (
        <SectionLabel>
          {t('storage.namespacesCount', { count: visibleKv.length })}
        </SectionLabel>
      ) : (
        <SectionLabel>
          {t('storage.databasesCount', { count: visibleD1.length })}
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
        <CompactHeader scrollY={scrollY} title={t('storage.title')} />
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
                    segment === 'r2'
                      ? 'storage.noBuckets'
                      : segment === 'kv'
                        ? 'storage.noNamespaces'
                        : 'storage.noDatabases',
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

      <Modal
        animationType="slide"
        onRequestClose={() => setCreator(null)}
        transparent
        visible={creator !== null}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetBackdropWrap}
        >
          <Pressable
            onPress={() => setCreator(null)}
            style={styles.sheetBackdrop}
            testID="storage-creator-backdrop"
          />
          {creator ? (
            <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
              <View
                style={[
                  styles.sheetHandle,
                  { backgroundColor: label(mode, 0.2) },
                ]}
              />
              <View style={styles.sheetHeader}>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setCreator(null)}
                  style={styles.sheetHeaderSide}
                >
                  <Text style={styles.sheetCancel}>{t('common.cancel')}</Text>
                </Pressable>
                <Text
                  numberOfLines={1}
                  style={[styles.sheetTitle, { color: colors.text }]}
                >
                  {creator.kind === 'r2'
                    ? t('storage.createBucket')
                    : creator.kind === 'kv'
                      ? t('storage.createNamespace')
                      : t('storage.createDatabase')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={creating}
                  hitSlop={8}
                  onPress={submitCreate}
                  style={[styles.sheetHeaderSide, styles.sheetHeaderRight]}
                  testID="storage-create"
                >
                  {creating ? (
                    <ActivityIndicator color={accent.orange} size="small" />
                  ) : (
                    <Text style={styles.sheetAction}>{t('storage.create')}</Text>
                  )}
                </Pressable>
              </View>

              {snapshot.accounts.length > 1 ? (
                <>
                  <Text
                    style={[styles.fieldLabel, { color: label(mode, 0.5) }]}
                  >
                    {t('storage.accountLabel')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pills}
                  >
                    {snapshot.accounts.map((account) => {
                      const selected =
                        account.accountId === creator.accountId;
                      return (
                        <Pressable
                          key={account.accountId}
                          accessibilityRole="button"
                          onPress={() =>
                            setCreator({
                              ...creator,
                              accountId: account.accountId,
                            })
                          }
                          style={[
                            styles.pill,
                            {
                              backgroundColor: selected
                                ? accent.orange
                                : colors.searchBg,
                            },
                          ]}
                          testID={`storage-account-${account.accountId}`}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.pillText,
                              {
                                color: selected
                                  ? foreground.onAccent
                                  : label(mode, 0.6),
                              },
                            ]}
                          >
                            {account.accountName}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              <Text style={[styles.fieldLabel, { color: label(mode, 0.5) }]}>
                {t('storage.nameLabel')}
              </Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(name) => {
                  setCreatorError(null);
                  setCreator({ ...creator, name });
                }}
                placeholder={
                  creator.kind === 'r2'
                    ? t('storage.bucketNamePlaceholder')
                    : creator.kind === 'kv'
                      ? t('storage.namespaceNamePlaceholder')
                      : t('storage.databaseNamePlaceholder')
                }
                placeholderTextColor={label(mode, 0.3)}
                style={[
                  styles.input,
                  { backgroundColor: colors.searchBg, color: colors.text },
                  creatorError ? styles.inputError : null,
                ]}
                testID="storage-input-name"
                value={creator.name}
              />
              {creatorError ? (
                <Text style={styles.fieldError} testID="storage-error-name">
                  {creatorError.startsWith('storage.')
                    ? t(creatorError)
                    : creatorError}
                </Text>
              ) : null}

              {creator.kind === 'r2' ? (
                <>
                  <Text
                    style={[styles.fieldLabel, { color: label(mode, 0.5) }]}
                  >
                    {t('storage.locationLabel')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pills}
                  >
                    {R2_LOCATIONS.map((location) => {
                      const selected = creator.location === location;
                      return (
                        <Pressable
                          key={location || 'auto'}
                          accessibilityRole="button"
                          onPress={() => setCreator({ ...creator, location })}
                          style={[
                            styles.pill,
                            {
                              backgroundColor: selected
                                ? accent.orange
                                : colors.searchBg,
                            },
                          ]}
                          testID={`storage-location-${location || 'auto'}`}
                        >
                          <Text
                            style={[
                              styles.pillText,
                              {
                                color: selected
                                  ? foreground.onAccent
                                  : label(mode, 0.6),
                              },
                            ]}
                          >
                            {location
                              ? location.toUpperCase()
                              : t('storage.locationAuto')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              {creatorAccount && snapshot.accounts.length === 1 ? (
                <Text style={[styles.creatorHint, { color: label(mode, 0.4) }]}>
                  {t('storage.accountLabel')}: {creatorAccount.accountName}
                </Text>
              ) : null}

            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: accent.orange,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  content: {},
  copy: {
    flex: 1,
    minWidth: 0,
  },
  creatorHint: {
    ...fontFace('footnote'),
    marginTop: 12,
    paddingHorizontal: 16,
  },
  fieldError: {
    ...fontFace('subhead'),
    color: accent.red,
    marginTop: 6,
    paddingHorizontal: 16,
  },
  fieldLabel: {
    ...fontFace('footnote', '500'),
    marginBottom: 6,
    marginTop: 14,
    paddingHorizontal: 16,
    textTransform: 'uppercase',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerCopy: {
    flex: 1,
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  input: {
    ...fontFace('headline', '400'),
    borderRadius: 10,
    marginHorizontal: 16,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputError: {
    borderColor: accent.red,
    borderWidth: 1,
  },
  issue: {
    ...fontFace('subhead'),
    marginTop: 8,
    paddingHorizontal: 16,
  },
  mono: {
    ...fontFace('bodySmall', '600'),
    fontFamily: 'Menlo',
  },
  name: {
    ...fontFace('bodyLarge', '500'),
  },
  ops: {
    ...fontFace('footnote'),
    fontVariant: ['tabular-nums'],
  },
  pill: {
    borderRadius: 17,
    justifyContent: 'center',
    maxWidth: 200,
    minHeight: 34,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  pillText: {
    ...fontFace('body', '600'),
  },
  pills: {
    gap: 8,
    paddingHorizontal: 16,
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
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 8,
  },
  sheetAction: {
    ...fontFace('headline'),
    color: accent.orange,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
  },
  sheetBackdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetCancel: {
    ...fontFace('headline', '400'),
    color: accent.orange,
  },
  sheetHandle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 5,
    marginBottom: 8,
    width: 36,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  sheetHeaderRight: {
    alignItems: 'flex-end',
  },
  sheetHeaderSide: {
    justifyContent: 'center',
    minWidth: 60,
  },
  sheetTitle: {
    ...fontFace('headline'),
    flex: 1,
    textAlign: 'center',
  },
  sub: {
    ...fontFace('subhead'),
    marginTop: 2,
  },
  subtitle: {
    ...fontFace('body'),
    marginTop: 3,
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
  titleStandalone: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
