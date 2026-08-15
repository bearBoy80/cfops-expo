import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Archive, Database, HardDrive, KeyRound, Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  createD1Database,
  createKvNamespace,
  createR2Bucket,
} from '@/src/cloudflare/api';
import {
  fetchStorageSnapshot,
  invalidateStorageSnapshot,
  type StorageSnapshot,
} from '@/src/cloudflare/accountResources';
import {
  fetchStorageMetrics,
  type StorageMetrics,
} from '@/src/cloudflare/analytics';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import {
  Card,
  EmptyState,
  ListRow,
  MetricTile,
  SectionLabel,
  SegmentedControl,
  useToast,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, foreground, label, tint } from '@/src/theme/tokens';
import { compactNumber, formatBytes } from '@/src/utils/format';

type StorageSegment = 'r2' | 'kv' | 'd1';

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

export default function Storage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [metrics, setMetrics] = useState<Map<string, StorageMetrics>>(
    new Map(),
  );
  const [segment, setSegment] = useState<StorageSegment>('r2');
  const [refreshing, setRefreshing] = useState(false);
  const [creator, setCreator] = useState<CreatorState | null>(null);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback((force: boolean) => {
    return fetchStorageSnapshot({ force })
      .then(async (next) => {
        setSnapshot(next);
        // Metrics are best-effort; missing data renders as "—".
        const collected = new Map<string, StorageMetrics>();
        await Promise.all(
          next.accounts.map(async (account) => {
            try {
              const bearer = await getBearerForConnection(
                account.connectionId,
              );
              collected.set(
                account.accountId,
                await fetchStorageMetrics(bearer, account.accountId),
              );
            } catch {
              // Ignore: quota or permission failures leave metrics empty.
            }
          }),
        );
        setMetrics(collected);
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
    invalidateStorageSnapshot();
    void load(true).finally(() => setRefreshing(false));
  };

  const showAccountName = (snapshot?.accounts.length ?? 0) > 1;

  const r2Totals = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    let stored = 0;
    let objects = 0;
    let found = false;
    for (const bucket of snapshot.buckets) {
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
  }, [snapshot, metrics]);

  const openCreator = () => {
    const account = snapshot?.accounts[0];
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

  if (!snapshot) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.title, styles.titleStandalone, { color: colors.text }]}>
          {t('storage.title')}
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

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={refreshing}
            tintColor={accent.orange}
          />
        }
        showsVerticalScrollIndicator={false}
      >
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
              { id: 'r2', label: t('storage.segR2') },
              { id: 'kv', label: t('storage.segKv') },
              { id: 'd1', label: t('storage.segD1') },
            ]}
            selected={segment}
            testIDPrefix="storage-segment"
          />
        </View>

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
              {t('storage.bucketsCount', { count: snapshot.buckets.length })}
            </SectionLabel>
            {snapshot.buckets.length === 0 ? (
              <Text style={[styles.empty, { color: label(mode, 0.4) }]}>
                {t('storage.noBuckets')}
              </Text>
            ) : (
              <Card>
                {snapshot.buckets.map((bucket, index) => {
                  const bucketMetrics = metrics
                    .get(bucket.accountId)
                    ?.r2.get(bucket.name);
                  const sub = [
                    showAccountName ? bucket.accountName : null,
                    bucket.location ? bucket.location.toUpperCase() : null,
                    bucketMetrics
                      ? t('storage.objectsCount', {
                          count: bucketMetrics.objectCount,
                        })
                      : null,
                    bucketMetrics
                      ? formatBytes(bucketMetrics.payloadSize)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ListRow
                      key={`${bucket.accountId}-${bucket.name}`}
                      last={index === snapshot.buckets.length - 1}
                      testID={`storage-bucket-${bucket.name}`}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/(storage)/r2/[bucket]',
                          params: {
                            bucket: bucket.name,
                            accountId: bucket.accountId,
                            connectionId: bucket.connectionId,
                            location: bucket.location,
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

        {segment === 'kv' ? (
          <>
            <SectionLabel>
              {t('storage.namespacesCount', {
                count: snapshot.kvNamespaces.length,
              })}
            </SectionLabel>
            {snapshot.kvNamespaces.length === 0 ? (
              <Text style={[styles.empty, { color: label(mode, 0.4) }]}>
                {t('storage.noNamespaces')}
              </Text>
            ) : (
              <Card>
                {snapshot.kvNamespaces.map((namespace, index) => {
                  const kvMetrics = metrics
                    .get(namespace.accountId)
                    ?.kv.get(namespace.id);
                  const sub = [
                    showAccountName ? namespace.accountName : null,
                    kvMetrics
                      ? t('storage.keysCount', { count: kvMetrics.keyCount })
                      : null,
                    kvMetrics ? formatBytes(kvMetrics.byteCount) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ListRow
                      key={`${namespace.accountId}-${namespace.id}`}
                      last={index === snapshot.kvNamespaces.length - 1}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/(storage)/kv/[namespace]',
                          params: {
                            namespace: namespace.id,
                            accountId: namespace.accountId,
                            connectionId: namespace.connectionId,
                            accountName: namespace.accountName,
                            title: namespace.title,
                          },
                        } as unknown as Href)
                      }
                      testID={`storage-kv-${namespace.id}`}
                      right={
                        kvMetrics ? (
                          <Text
                            style={[styles.ops, { color: label(mode, 0.4) }]}
                          >
                            {t('storage.reads', {
                              value: compactNumber(kvMetrics.reads),
                            })}{' '}
                            {t('storage.writes', {
                              value: compactNumber(kvMetrics.writes),
                            })}
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

        {segment === 'd1' ? (
          <>
            <SectionLabel>
              {t('storage.databasesCount', {
                count: snapshot.d1Databases.length,
              })}
            </SectionLabel>
            {snapshot.d1Databases.length === 0 ? (
              <Text style={[styles.empty, { color: label(mode, 0.4) }]}>
                {t('storage.noDatabases')}
              </Text>
            ) : (
              <Card>
                {snapshot.d1Databases.map((database, index) => {
                  const d1Metrics = metrics
                    .get(database.accountId)
                    ?.d1.get(database.uuid);
                  const sub = [
                    showAccountName ? database.accountName : null,
                    database.fileSize !== null
                      ? formatBytes(database.fileSize)
                      : null,
                    database.numTables !== null
                      ? t('storage.tablesCount', {
                          count: database.numTables,
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ListRow
                      key={`${database.accountId}-${database.uuid}`}
                      last={index === snapshot.d1Databases.length - 1}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/(storage)/d1/[database]',
                          params: {
                            database: database.uuid,
                            accountId: database.accountId,
                            connectionId: database.connectionId,
                            accountName: database.accountName,
                            name: database.name,
                            ...(database.createdAt
                              ? { createdAt: database.createdAt }
                              : {}),
                            ...(database.version
                              ? { version: database.version }
                              : {}),
                          },
                        } as unknown as Href)
                      }
                      testID={`storage-d1-${database.uuid}`}
                      right={
                        d1Metrics ? (
                          <Text
                            style={[styles.ops, { color: label(mode, 0.4) }]}
                          >
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
      </ScrollView>

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
  content: {
    paddingBottom: 32,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  creatorHint: {
    fontSize: 12,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  empty: {
    fontSize: 15,
    marginTop: 12,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  fieldError: {
    color: accent.red,
    fontSize: 13,
    marginTop: 6,
    paddingHorizontal: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
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
    borderRadius: 10,
    fontSize: 17,
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
    fontFamily: 'Menlo',
    fontSize: 14,
    fontWeight: '600',
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
  },
  ops: {
    fontSize: 12,
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
    fontSize: 15,
    fontWeight: '600',
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
    color: accent.orange,
    fontSize: 17,
    fontWeight: '600',
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
    color: accent.orange,
    fontSize: 17,
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
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  sub: {
    fontSize: 13,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 3,
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
  titleStandalone: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
