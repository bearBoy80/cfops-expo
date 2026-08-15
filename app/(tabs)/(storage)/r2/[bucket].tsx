import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, ArrowDownToLine, ArrowUpFromLine, HardDrive } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  addR2CustomDomain,
  deleteR2Bucket,
  deleteR2CustomDomain,
  getR2ManagedDomain,
  listR2CustomDomains,
  listR2Objects,
  setR2ManagedDomain,
  type CfR2CustomDomain,
  type CfR2ManagedDomain,
  type CfR2Object,
} from '@/src/cloudflare/api';
import { invalidateStorageSnapshot } from '@/src/cloudflare/accountResources';
import {
  fetchStorageMetrics,
  type R2BucketMetrics,
} from '@/src/cloudflare/analytics';
import {
  fetchZonesSnapshot,
  getBearerForConnection,
} from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  Card,
  ListRow,
  MetricTile,
  Pill,
  SectionLabel,
  showActionMenu,
  ToggleRow,
  useToast,
  type Status,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, foreground, label } from '@/src/theme/tokens';
import {
  compactNumber,
  formatBytes,
  relativeTime,
} from '@/src/utils/format';

const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

interface ZoneOption {
  id: string;
  name: string;
}

function domainPillStatus(status: string): Status {
  if (status === 'active') {
    return 'active';
  }
  if (status === 'pending' || status === 'initializing') {
    return 'pending';
  }
  return 'error';
}

export default function R2BucketDetail() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    bucket: string;
    accountId: string;
    connectionId: string;
    location?: string;
  }>();
  const [bearer, setBearer] = useState<string | null>(null);
  const [objects, setObjects] = useState<CfR2Object[] | null>(null);
  const [metrics, setMetrics] = useState<R2BucketMetrics | null>(null);
  const [managed, setManaged] = useState<CfR2ManagedDomain | null>(null);
  const [domains, setDomains] = useState<CfR2CustomDomain[] | null>(null);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [domainSheet, setDomainSheet] = useState<{
    domain: string;
    zoneId: string;
  } | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);

  const loadAccess = useCallback(async (resolved: string) => {
    await Promise.all([
      getR2ManagedDomain(resolved, params.accountId, params.bucket)
        .then(setManaged)
        .catch(() => {}),
      listR2CustomDomains(resolved, params.accountId, params.bucket)
        .then(setDomains)
        .catch(() => setDomains([])),
    ]);
  }, [params.accountId, params.bucket]);

  const load = useCallback(async () => {
    const resolved = await getBearerForConnection(params.connectionId);
    setBearer(resolved);
    await Promise.all([
      listR2Objects(resolved, params.accountId, params.bucket)
        .then(setObjects)
        .catch(() => {
          setObjects([]);
        }),
      fetchStorageMetrics(resolved, params.accountId)
        .then((accountMetrics) =>
          setMetrics(accountMetrics.r2.get(params.bucket) ?? null),
        )
        .catch(() => {}),
      loadAccess(resolved),
      fetchZonesSnapshot()
        .then((snapshot) => {
          setZones(
            snapshot.zones
              .filter((zone) => zone.accountId === params.accountId)
              .map((zone) => ({ id: zone.id, name: zone.name })),
          );
        })
        .catch(() => {}),
    ]);
  }, [loadAccess, params.accountId, params.bucket, params.connectionId]);

  useEffect(() => {
    let active = true;
    void load()
      .catch((cause) => {
        if (active) {
          setError(cloudflareErrorMessage(cause));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [load]);

  const togglePublic = (enabled: boolean) => {
    if (!bearer || busy) {
      return;
    }
    const previous = managed;
    setManaged({ domain: managed?.domain ?? '', enabled });
    setBusy(true);
    void setR2ManagedDomain(bearer, params.accountId, params.bucket, enabled)
      .then(() => {
        showToast(t('storage.settingSaved'));
      })
      .catch((cause) => {
        setManaged(previous);
        showToast(cloudflareErrorMessage(cause), 'error');
      })
      .finally(() => setBusy(false));
  };

  const submitDomain = () => {
    if (!domainSheet || !bearer) {
      return;
    }
    const domain = domainSheet.domain.trim().toLowerCase();
    if (!HOSTNAME_PATTERN.test(domain)) {
      setDomainError(t('storage.errDomain'));
      return;
    }
    if (!domainSheet.zoneId) {
      setDomainError(t('storage.errZone'));
      return;
    }
    setBusy(true);
    void addR2CustomDomain(bearer, params.accountId, params.bucket, {
      domain,
      zoneId: domainSheet.zoneId,
    })
      .then(async () => {
        setDomainSheet(null);
        showToast(t('storage.domainAdded'));
        await loadAccess(bearer);
      })
      .catch((cause) => {
        setDomainError(cloudflareErrorMessage(cause));
      })
      .finally(() => setBusy(false));
  };

  const confirmRemoveDomain = (domain: CfR2CustomDomain) => {
    if (!bearer || busy) {
      return;
    }
    showActionMenu({
      title: domain.domain,
      message: t('storage.removeDomainConfirm', { name: domain.domain }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.removeDomain'),
          destructive: true,
          onPress: () => {
            setBusy(true);
            void deleteR2CustomDomain(
              bearer,
              params.accountId,
              params.bucket,
              domain.domain,
            )
              .then(async () => {
                showToast(t('storage.domainRemoved'));
                await loadAccess(bearer);
              })
              .catch((cause) => {
                showToast(cloudflareErrorMessage(cause), 'error');
              })
              .finally(() => setBusy(false));
          },
        },
      ],
    });
  };

  const confirmDelete = () => {
    if (!bearer || busy) {
      return;
    }
    showActionMenu({
      title: t('storage.deleteBucket'),
      message: t('storage.deleteBucketConfirm', { name: params.bucket }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.deleteBucket'),
          destructive: true,
          onPress: () => {
            setBusy(true);
            void deleteR2Bucket(bearer, params.accountId, params.bucket)
              .then(() => {
                invalidateStorageSnapshot();
                showToast(t('storage.bucketDeleted'));
                router.back();
              })
              .catch((cause) => {
                showToast(cloudflareErrorMessage(cause), 'error');
              })
              .finally(() => setBusy(false));
          },
        },
      ],
    });
  };

  return (
    <ZoneSubpage
      backLabel={t('storage.title')}
      error={error}
      loading={loading}
      subtitle={
        params.location ? `${params.location.toUpperCase()} · R2` : 'R2'
      }
      title={params.bucket}
    >
      <View style={styles.tileRow}>
        <MetricTile
          Icon={Archive}
          color={accent.blue}
          label={t('storage.objects')}
          value={metrics ? compactNumber(metrics.objectCount) : '—'}
        />
        <MetricTile
          Icon={HardDrive}
          color={accent.orange}
          label={t('storage.stored')}
          value={metrics ? formatBytes(metrics.payloadSize) : '—'}
        />
      </View>
      <View style={styles.tileRow}>
        <MetricTile
          Icon={ArrowUpFromLine}
          color={accent.purple}
          label={t('storage.classAOps')}
          sub={t('storage.classASub')}
          value={metrics ? compactNumber(metrics.classAOps) : '—'}
        />
        <MetricTile
          Icon={ArrowDownToLine}
          color={accent.green}
          label={t('storage.classBOps')}
          sub={t('storage.classBSub')}
          value={metrics ? compactNumber(metrics.classBOps) : '—'}
        />
      </View>

      {managed ? (
        <>
          <SectionLabel>{t('storage.sectionAccess')}</SectionLabel>
          <Card>
            <ToggleRow
              label={t('storage.r2DevLabel')}
              last
              sub={
                managed.domain
                  ? managed.domain
                  : t('storage.r2DevSub')
              }
              testID="r2-toggle-public"
              value={managed.enabled}
              onValueChange={togglePublic}
            />
          </Card>
        </>
      ) : null}

      <SectionLabel>{t('storage.sectionDomains')}</SectionLabel>
      <Card>
        {(domains ?? []).map((domain) => (
          <ListRow
            key={domain.domain}
            chevron={false}
            onPress={() => confirmRemoveDomain(domain)}
            testID={`r2-domain-${domain.domain}`}
            right={<Pill status={domainPillStatus(domain.status)} />}
            left={
              <View style={styles.copy}>
                <Text
                  numberOfLines={1}
                  style={[styles.mono, { color: colors.text }]}
                >
                  {domain.domain}
                </Text>
                {domain.zoneName ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.objectSub, { color: label(mode, 0.4) }]}
                  >
                    {domain.zoneName}
                  </Text>
                ) : null}
              </View>
            }
          />
        ))}
        <ListRow
          chevron={false}
          last
          onPress={() => {
            setDomainError(null);
            setDomainSheet({ domain: '', zoneId: zones[0]?.id ?? '' });
          }}
          testID="r2-add-domain"
          left={<Text style={styles.addRow}>{t('storage.addDomain')}</Text>}
        />
      </Card>

      <SectionLabel>{t('storage.egress')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          last
          left={
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t('storage.egressRow')}
            </Text>
          }
          right={
            <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
              {t('storage.egressFree')} · {t('storage.alwaysFree')}
            </Text>
          }
        />
      </Card>

      <SectionLabel>
        {t('storage.objectsCount', { count: objects?.length ?? 0 })}
      </SectionLabel>
      {objects && objects.length > 0 ? (
        <Card>
          {objects.map((object, index) => (
            <ListRow
              key={object.key}
              chevron={false}
              last={index === objects.length - 1}
              testID={`r2-object-${index}`}
              left={
                <View style={styles.copy}>
                  <Text
                    numberOfLines={1}
                    style={[styles.objectKey, { color: colors.text }]}
                  >
                    {object.key}
                  </Text>
                  <Text style={[styles.objectSub, { color: label(mode, 0.4) }]}>
                    {[
                      formatBytes(object.size),
                      object.lastModified
                        ? relativeTime(object.lastModified, t)
                        : null,
                    ]
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
          {t('storage.noObjects')}
        </Text>
      )}

      <SectionLabel>{t('storage.sectionActions')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          last
          onPress={busy ? undefined : confirmDelete}
          testID="r2-delete-bucket"
          left={
            <Text style={styles.deleteLabel}>{t('storage.deleteBucket')}</Text>
          }
        />
      </Card>

      <Modal
        animationType="slide"
        onRequestClose={() => setDomainSheet(null)}
        transparent
        visible={domainSheet !== null}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetBackdropWrap}
        >
          <Pressable
            onPress={() => setDomainSheet(null)}
            style={styles.sheetBackdrop}
            testID="r2-domain-backdrop"
          />
          {domainSheet ? (
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
                  onPress={() => setDomainSheet(null)}
                  style={styles.sheetHeaderSide}
                >
                  <Text style={styles.sheetCancel}>{t('common.cancel')}</Text>
                </Pressable>
                <Text
                  numberOfLines={1}
                  style={[styles.sheetTitle, { color: colors.text }]}
                >
                  {t('storage.addDomain')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  hitSlop={8}
                  onPress={submitDomain}
                  style={[styles.sheetHeaderSide, styles.sheetHeaderRight]}
                  testID="r2-domain-save"
                >
                  {busy ? (
                    <ActivityIndicator color={accent.orange} size="small" />
                  ) : (
                    <Text style={styles.sheetAction}>{t('common.add')}</Text>
                  )}
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { color: label(mode, 0.5) }]}>
                {t('storage.domainLabel')}
              </Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={(domain) => {
                  setDomainError(null);
                  setDomainSheet({ ...domainSheet, domain });
                }}
                placeholder={t('storage.domainPlaceholder')}
                placeholderTextColor={label(mode, 0.3)}
                style={[
                  styles.input,
                  { backgroundColor: colors.searchBg, color: colors.text },
                  domainError ? styles.inputError : null,
                ]}
                testID="r2-domain-input"
                value={domainSheet.domain}
              />
              {domainError ? (
                <Text style={styles.fieldError} testID="r2-domain-error">
                  {domainError}
                </Text>
              ) : null}

              <Text style={[styles.fieldLabel, { color: label(mode, 0.5) }]}>
                {t('storage.zoneLabel')}
              </Text>
              {zones.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pills}
                >
                  {zones.map((zone) => {
                    const selected = zone.id === domainSheet.zoneId;
                    return (
                      <Pressable
                        key={zone.id}
                        accessibilityRole="button"
                        onPress={() => {
                          setDomainError(null);
                          setDomainSheet({ ...domainSheet, zoneId: zone.id });
                        }}
                        style={[
                          styles.pill,
                          {
                            backgroundColor: selected
                              ? accent.orange
                              : colors.searchBg,
                          },
                        ]}
                        testID={`r2-domain-zone-${zone.id}`}
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
                          {zone.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={[styles.emptyZones, { color: label(mode, 0.4) }]}>
                  {t('storage.errZone')}
                </Text>
              )}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  addRow: {
    color: accent.orange,
    fontSize: 17,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  deleteLabel: {
    color: accent.red,
    fontSize: 17,
  },
  empty: {
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  emptyZones: {
    fontSize: 13,
    paddingHorizontal: 16,
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
  mono: {
    fontFamily: 'Menlo',
    fontSize: 13,
    fontWeight: '600',
  },
  objectKey: {
    fontFamily: 'Menlo',
    fontSize: 13,
  },
  objectSub: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  pill: {
    borderRadius: 17,
    justifyContent: 'center',
    maxWidth: 220,
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
  rowLabel: {
    fontSize: 17,
  },
  rowValue: {
    fontSize: 15,
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
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
  },
});
