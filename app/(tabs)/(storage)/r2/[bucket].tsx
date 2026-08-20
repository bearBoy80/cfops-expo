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
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  HardDrive,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  addR2CustomDomain,
  deleteR2Bucket,
  deleteR2CustomDomain,
  deleteR2Objects,
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
  invalidateStorageMetrics,
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
  InlineEmpty,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useSequencer, type IfCurrent } from '@/src/state/useSequencedLoad';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, foreground, label } from '@/src/theme/tokens';
import { haptics } from '@/src/utils/haptics';
import {
  compactNumber,
  formatBytes,
  relativeTime,
} from '@/src/utils/format';

/**
 * R2 keys are path-like, and every object under one prefix shares a long head.
 * Tail-truncating the whole key hides the filename — the only part that tells
 * them apart — so the name leads and the prefix drops to the meta line.
 */
function objectName(key: string): string {
  const cut = key.lastIndexOf('/');
  return cut === -1 ? key : (key.slice(cut + 1) || key);
}

function objectPrefix(key: string): string {
  const cut = key.lastIndexOf('/');
  return cut === -1 ? '' : key.slice(0, cut);
}

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
  /** Multi-select mode. Outside it the list is plain and rows swipe to delete. */
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
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
  const sequence = useSequencer();

  const loadAccess = useCallback(
    async (resolved: string, ifCurrent: IfCurrent) => {
      await Promise.all([
        getR2ManagedDomain(resolved, params.accountId, params.bucket)
          .then(ifCurrent(setManaged))
          .catch(() => {}),
        listR2CustomDomains(resolved, params.accountId, params.bucket)
          .then(ifCurrent(setDomains))
          .catch(() => ifCurrent(setDomains)([])),
      ]);
    },
    [params.accountId, params.bucket],
  );

  const load = useCallback(
    () =>
      sequence(async (ifCurrent) => {
        const resolved = await getBearerForConnection(params.connectionId);
        ifCurrent(setBearer)(resolved);
        await Promise.all([
          listR2Objects(resolved, params.accountId, params.bucket)
            .then(ifCurrent(setObjects))
            .catch(() => {
              ifCurrent(setObjects)([]);
            }),
          fetchStorageMetrics(resolved, params.accountId)
            .then((accountMetrics) =>
              ifCurrent(setMetrics)(
                accountMetrics.r2.get(params.bucket) ?? null,
              ),
            )
            .catch(() => {}),
          loadAccess(resolved, ifCurrent),
          fetchZonesSnapshot()
            .then((snapshot) => {
              ifCurrent(setZones)(
                snapshot.zones
                  .filter((zone) => zone.accountId === params.accountId)
                  .map((zone) => ({ id: zone.id, name: zone.name })),
              );
            })
            .catch(() => {}),
        ]);
      }),
    [
      loadAccess,
      params.accountId,
      params.bucket,
      params.connectionId,
      sequence,
    ],
  );

  /** Re-reads just the access settings after changing one of them. */
  const reloadAccess = useCallback(
    (resolved: string) =>
      sequence((ifCurrent) => loadAccess(resolved, ifCurrent)),
    [loadAccess, sequence],
  );

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
        await reloadAccess(bearer);
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
                await reloadAccess(bearer);
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

  const toggleObject = (key: string) => {
    haptics.selection();
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const allSelected =
    !!objects && objects.length > 0 && selected.length === objects.length;
  const deleteDisabled = busy || selected.length === 0;

  const toggleEditing = () => {
    haptics.selection();
    setEditing((current) => {
      if (current) {
        // Leaving the mode drops the selection, so reopening it starts clean.
        setSelected([]);
      }
      return !current;
    });
  };

  const runDelete = (keys: string[]) => {
    if (!bearer) {
      return;
    }
    setBusy(true);
    void deleteR2Objects(bearer, params.accountId, params.bucket, keys)
      .then((outcome) => {
        // Only clear what actually went away, so a retry keeps the failures
        // selected instead of silently dropping them.
        setSelected((current) =>
          current.filter((key) => !outcome.deleted.includes(key)),
        );
        invalidateStorageMetrics(params.accountId);
        if (outcome.failed.length === 0) {
          showToast(
            t('storage.objectsDeleted', { count: outcome.deleted.length }),
          );
        } else {
          showToast(
            t('storage.objectsDeletedPartial', {
              count: outcome.deleted.length,
              failed: outcome.failed.length,
            }),
            'error',
          );
        }
        return load();
      })
      .catch((cause) => {
        showToast(cloudflareErrorMessage(cause), 'error');
      })
      .finally(() => setBusy(false));
  };

  /**
   * Row menu behind the chevron: the two things you can do with one object.
   * Matching the version list, the destructive item runs straight away — the
   * sheet names the object and offers Cancel, so it is the confirmation.
   */
  const openObjectMenu = (key: string) => {
    if (!bearer || busy) {
      return;
    }
    showActionMenu({
      title: objectName(key),
      message: t('storage.deleteObjectConfirm', { name: key }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.deleteObjects'),
          destructive: true,
          onPress: () => runDelete([key]),
        },
        {
          label: t('storage.select'),
          // Starts the selection from the object that was tapped.
          onPress: () => {
            setEditing(true);
            setSelected([key]);
          },
        },
      ],
    });
  };

  /** Confirmation for the toolbar, where a whole selection is at stake. */
  const confirmDeleteSelection = () => {
    if (!bearer || busy || selected.length === 0) {
      return;
    }
    const keys = selected;
    showActionMenu({
      title: t('storage.deleteSelected', { count: keys.length }),
      message: t('storage.deleteObjectsConfirm', { count: keys.length }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.deleteObjects'),
          destructive: true,
          onPress: () => runDelete(keys),
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
                invalidateStorageMetrics(params.accountId);
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
      footer={
        /*
         * Present for the whole of selection mode, with the destructive action
         * dimmed until something is picked. Hiding the bar on an empty
         * selection stranded the user in a screen of empty checkboxes with no
         * visible state and no way out but the header.
         */
        editing ? (
          <View style={styles.objectToolbar}>
            <View style={styles.toolbarGroup}>
              {/*
               * The way out has to live here: the header's control scrolls away
               * with the large title, so in a long list it stops being
               * reachable and the mode becomes inescapable.
               */}
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={toggleEditing}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                testID="r2-exit-select"
              >
                <Text style={styles.clearSelection}>
                  {t('storage.selectDone')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() =>
                  setSelected(
                    allSelected ? [] : (objects ?? []).map((item) => item.key),
                  )
                }
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                testID="r2-select-all"
              >
                <Text style={styles.clearSelection}>
                  {allSelected
                    ? t('storage.deselectAll')
                    : t('storage.selectAll')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: deleteDisabled }}
              disabled={deleteDisabled}
              hitSlop={8}
              onPress={confirmDeleteSelection}
              style={({ pressed }) => ({
                opacity: deleteDisabled ? 0.35 : pressed ? 0.6 : 1,
              })}
              testID="r2-delete-objects"
            >
              <Text style={styles.toolbarDestructive}>
                {selected.length === 0
                  ? t('storage.deleteObjects')
                  : t('storage.deleteSelected', { count: selected.length })}
              </Text>
            </Pressable>
          </View>
        ) : null
      }
      headerRight={
        // Entry only: once in selection mode the pinned toolbar owns the exit,
        // so a second control here would just duplicate it — and scroll away.
        !editing && objects && objects.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={toggleEditing}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            testID="r2-toggle-select"
          >
            <Text style={styles.clearSelection}>{t('storage.select')}</Text>
          </Pressable>
        ) : undefined
      }
      loading={loading}
      onRefresh={load}
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
          {objects.map((object, index) => {
            const picked = selected.includes(object.key);
            return (
              <ListRow
                key={object.key}
                // The chevron is the visible way in to the row's actions; in
                // selection mode the checkbox takes over that slot.
                chevron={!editing}
                last={index === objects.length - 1}
                onPress={
                  busy
                    ? undefined
                    : editing
                      ? () => toggleObject(object.key)
                      : () => openObjectMenu(object.key)
                }
                testID={`r2-object-${index}`}
                right={
                  editing ? (
                    <View
                      style={[
                        styles.checkbox,
                        picked
                          ? { backgroundColor: accent.orange, borderColor: accent.orange }
                          : { borderColor: label(mode, 0.25) },
                      ]}
                    >
                      {picked ? (
                        <Check
                          accessibilityElementsHidden
                          color={foreground.onAccent}
                          size={13}
                          strokeWidth={3}
                        />
                      ) : null}
                    </View>
                  ) : undefined
                }
                left={
                  <View style={styles.copy}>
                    <Text
                      numberOfLines={1}
                      style={[styles.objectKey, { color: colors.text }]}
                    >
                      {objectName(object.key)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.objectSub, { color: label(mode, 0.4) }]}
                    >
                      {[
                        objectPrefix(object.key),
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
            );
          })}
        </Card>
      ) : (
        <InlineEmpty>
          {t('storage.noObjects')}
        </InlineEmpty>
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
    ...fontFace('headline', '400'),
    color: accent.orange,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  clearSelection: {
    ...fontFace('bodyLarge'),
    color: accent.orange,
  },
  /*
   * Both toolbar sides are text buttons, as iOS toolbars are. A filled
   * destructive Button would be invisible here: its background is `surface`
   * (#1c1c1e) and the toolbar is `tabbar` (#161618), so only the label showed.
   */
  toolbarDestructive: {
    ...fontFace('bodyLarge', '600'),
    color: accent.red,
  },
  objectToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Standard toolbar row height, so both labels are comfortably tappable.
    minHeight: 44,
  },
  /** Mode controls sit together, away from the destructive action. */
  toolbarGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 20,
  },
  deleteLabel: {
    ...fontFace('headline', '400'),
    color: accent.red,
  },
  empty: {
    ...fontFace('bodySmall'),
    marginTop: 8,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  emptyZones: {
    ...fontFace('subhead'),
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
  mono: {
    ...fontFace('subhead', '600'),
    fontFamily: 'Menlo',
  },
  objectKey: {
    ...fontFace('subhead'),
    fontFamily: 'Menlo',
  },
  objectSub: {
    ...fontFace('footnote'),
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
    ...fontFace('body', '600'),
  },
  pills: {
    gap: 8,
    paddingHorizontal: 16,
  },
  rowLabel: {
    ...fontFace('headline', '400'),
  },
  rowValue: {
    ...fontFace('body'),
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
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
  },
});
