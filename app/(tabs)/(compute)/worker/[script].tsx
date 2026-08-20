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
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Cpu, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  attachWorkerDomain,
  detachWorkerDomain,
  getActiveWorkerVersion,
  getWorkerSubdomainConfig,
  listWorkerDomains,
  listWorkerVersions,
  rollbackWorkerVersion,
  setWorkerSubdomainConfig,
  type CfWorkerDomain,
  type CfWorkerSubdomainConfig,
  type CfWorkerVersion,
} from '@/src/cloudflare/api';
import {
  fetchWorkerHourlySeries,
  fetchWorkerMetrics,
  type WorkerMetrics,
} from '@/src/cloudflare/analytics';
import { invalidateComputeSnapshot } from '@/src/cloudflare/accountResources';
import {
  fetchZonesSnapshot,
  getBearerForConnection,
} from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  AreaChart,
  Card,
  ListRow,
  MetricTile,
  Pill,
  SectionLabel,
  showActionMenu,
  ToggleRow,
  useToast,
  InlineEmpty,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useSequencer, type IfCurrent } from '@/src/state/useSequencedLoad';
import { useTheme } from '@/src/theme/ThemeContext';
import {
  accent,
  font,
  fontFace,
  foreground,
  label,
} from '@/src/theme/tokens';
import { compactNumber, relativeTime } from '@/src/utils/format';

const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const MAX_VERSIONS = 10;

interface ZoneOption {
  id: string;
  name: string;
}

export default function WorkerDetail() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    script: string;
    accountId: string;
    connectionId: string;
    accountName?: string;
    modifiedOn?: string;
    createdOn?: string;
  }>();
  const [bearer, setBearer] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<WorkerMetrics | null>(null);
  const [series, setSeries] = useState<{ label: string; value: number }[]>(
    [],
  );
  const [versions, setVersions] = useState<CfWorkerVersion[] | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [domains, setDomains] = useState<CfWorkerDomain[] | null>(null);
  const [subdomain, setSubdomain] = useState<CfWorkerSubdomainConfig | null>(
    null,
  );
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domainSheet, setDomainSheet] = useState<{
    hostname: string;
    zoneId: string;
  } | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useSequencer();

  const loadManagement = useCallback(
    async (resolved: string, ifCurrent: IfCurrent) => {
      // Every block degrades independently: missing write/read permissions
      // must not blank the whole page.
      await Promise.all([
        listWorkerVersions(resolved, params.accountId, params.script)
          .then((items) => ifCurrent(setVersions)(items.slice(0, MAX_VERSIONS)))
          .catch(() => ifCurrent(setVersions)([])),
        getActiveWorkerVersion(resolved, params.accountId, params.script)
          .then(ifCurrent(setActiveVersionId))
          .catch(() => {}),
        listWorkerDomains(resolved, params.accountId, params.script)
          .then(ifCurrent(setDomains))
          .catch(() => ifCurrent(setDomains)([])),
        getWorkerSubdomainConfig(resolved, params.accountId, params.script)
          .then(ifCurrent(setSubdomain))
          .catch(() => {}),
      ]);
    },
    [params.accountId, params.script],
  );

  const load = useCallback(
    () =>
      sequence(async (ifCurrent) => {
        ifCurrent(setError)(null);
        try {
          const resolved = await getBearerForConnection(params.connectionId);
          ifCurrent(setBearer)(resolved);
          await Promise.all([
            fetchWorkerMetrics(resolved, params.accountId)
              .then((all) => {
                ifCurrent(setMetrics)(all.get(params.script) ?? null);
              })
              .catch(() => {}),
            fetchWorkerHourlySeries(resolved, params.accountId, params.script)
              .then(ifCurrent(setSeries))
              .catch(() => {}),
            loadManagement(resolved, ifCurrent),
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
        } catch (cause) {
          ifCurrent(setError)(cloudflareErrorMessage(cause));
        } finally {
          ifCurrent(setLoading)(false);
        }
      }),
    [
      loadManagement,
      params.accountId,
      params.connectionId,
      params.script,
      sequence,
    ],
  );

  /** Re-reads just the management blocks after changing one of them. */
  const reloadManagement = useCallback(
    (resolved: string) =>
      sequence((ifCurrent) => loadManagement(resolved, ifCurrent)),
    [loadManagement, sequence],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const confirmRollback = (version: CfWorkerVersion) => {
    if (!bearer || busy) {
      return;
    }
    showActionMenu({
      title: t('compute.rollback'),
      message: t('compute.rollbackWorkerConfirm', {
        name: params.script,
        version: version.id.slice(0, 8),
      }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('compute.rollback'),
          destructive: true,
          onPress: () => {
            setBusy(true);
            void rollbackWorkerVersion(
              bearer,
              params.accountId,
              params.script,
              version.id,
            )
              .then(async () => {
                // The list row shows modifiedOn, which the rollback bumps.
                invalidateComputeSnapshot();
                showToast(t('compute.rollbackDone'));
                await reloadManagement(bearer);
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

  const updateSubdomain = (next: CfWorkerSubdomainConfig) => {
    if (!bearer || busy) {
      return;
    }
    const previous = subdomain;
    setSubdomain(next);
    setBusy(true);
    void setWorkerSubdomainConfig(bearer, params.accountId, params.script, next)
      .then(() => {
        showToast(t('compute.settingSaved'));
      })
      .catch((cause) => {
        setSubdomain(previous);
        showToast(cloudflareErrorMessage(cause), 'error');
      })
      .finally(() => setBusy(false));
  };

  const openDomainSheet = () => {
    setDomainError(null);
    setDomainSheet({ hostname: '', zoneId: zones[0]?.id ?? '' });
  };

  const submitDomain = () => {
    if (!domainSheet || !bearer) {
      return;
    }
    const hostname = domainSheet.hostname.trim().toLowerCase();
    if (!HOSTNAME_PATTERN.test(hostname)) {
      setDomainError(t('compute.errDomain'));
      return;
    }
    if (!domainSheet.zoneId) {
      setDomainError(t('compute.errZone'));
      return;
    }
    setBusy(true);
    void attachWorkerDomain(bearer, params.accountId, {
      zoneId: domainSheet.zoneId,
      hostname,
      service: params.script,
    })
      .then(async () => {
        setDomainSheet(null);
        showToast(t('compute.domainAdded'));
        await reloadManagement(bearer);
      })
      .catch((cause) => {
        // Toasts render below RN modals, so surface the failure inline.
        setDomainError(cloudflareErrorMessage(cause));
      })
      .finally(() => setBusy(false));
  };

  const confirmDetach = (domain: CfWorkerDomain) => {
    if (!bearer || busy) {
      return;
    }
    showActionMenu({
      title: domain.hostname,
      message: t('compute.removeDomainConfirm', { name: domain.hostname }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('compute.removeDomain'),
          destructive: true,
          onPress: () => {
            setBusy(true);
            void detachWorkerDomain(bearer, params.accountId, domain.id)
              .then(async () => {
                showToast(t('compute.domainRemoved'));
                await reloadManagement(bearer);
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
      backLabel={t('compute.title')}
      error={error}
      loading={loading}
      onRefresh={load}
      subtitle={params.accountName}
      title={params.script}
    >
      <View style={styles.tileRow}>
        <MetricTile
          Icon={Zap}
          color={accent.orange}
          label={t('compute.requests')}
          sub={t('storage.last24h')}
          value={metrics ? compactNumber(metrics.requests) : '—'}
        />
        <MetricTile
          Icon={AlertTriangle}
          color={accent.red}
          label={t('compute.errors')}
          value={metrics ? compactNumber(metrics.errors) : '—'}
        />
        <MetricTile
          Icon={Cpu}
          color={accent.blue}
          label={t('compute.cpuP50')}
          value={
            metrics?.cpuP50Ms != null
              ? `${metrics.cpuP50Ms.toFixed(1)}ms`
              : '—'
          }
        />
      </View>

      <SectionLabel>{t('compute.chart24h')}</SectionLabel>
      <Card>
        {series.length > 1 ? (
          <View style={styles.chartWrap}>
            <AreaChart color={accent.orange} data={series} />
          </View>
        ) : (
          <ListRow
            chevron={false}
            last
            left={
              <InlineEmpty>
                {t('compute.noSeries')}
              </InlineEmpty>
            }
          />
        )}
      </Card>

      {subdomain ? (
        <>
          <SectionLabel>{t('compute.sectionAccess')}</SectionLabel>
          <Card>
            <ToggleRow
              label={t('compute.workersDevLabel')}
              sub={t('compute.workersDevSub')}
              testID="worker-toggle-workers-dev"
              value={subdomain.enabled}
              onValueChange={(enabled) =>
                updateSubdomain({ ...subdomain, enabled })
              }
            />
            <ToggleRow
              label={t('compute.previewUrlsLabel')}
              last
              sub={t('compute.previewUrlsSub')}
              testID="worker-toggle-previews"
              value={subdomain.previewsEnabled}
              onValueChange={(previewsEnabled) =>
                updateSubdomain({ ...subdomain, previewsEnabled })
              }
            />
          </Card>
        </>
      ) : null}

      <SectionLabel>{t('compute.sectionDomains')}</SectionLabel>
      <Card>
        {(domains ?? []).map((domain) => (
          <ListRow
            key={domain.id}
            chevron={false}
            onPress={() => confirmDetach(domain)}
            testID={`worker-domain-${domain.hostname}`}
            left={
              <View style={styles.copy}>
                <Text
                  numberOfLines={1}
                  style={[styles.mono, { color: colors.text }]}
                >
                  {domain.hostname}
                </Text>
                {domain.zoneName ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.sub, { color: label(mode, 0.4) }]}
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
          onPress={openDomainSheet}
          testID="worker-add-domain"
          left={
            <Text style={styles.addRow}>{t('compute.addDomain')}</Text>
          }
        />
      </Card>

      <SectionLabel>{t('compute.sectionVersions')}</SectionLabel>
      <Card>
        {versions && versions.length > 0 ? (
          versions.map((version, index) => {
            const isActive = version.id === activeVersionId;
            return (
              <ListRow
                key={version.id}
                chevron={!isActive}
                last={index === versions.length - 1}
                onPress={isActive ? undefined : () => confirmRollback(version)}
                testID={`worker-version-${version.id}`}
                right={isActive ? <Pill status="active" /> : undefined}
                left={
                  <View style={styles.copy}>
                    <Text
                      numberOfLines={1}
                      style={[styles.mono, { color: colors.text }]}
                    >
                      {version.id.slice(0, 8)}
                      {version.number !== null ? ` · v${version.number}` : ''}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.sub, { color: label(mode, 0.4) }]}
                    >
                      {[
                        version.message,
                        version.createdOn
                          ? relativeTime(version.createdOn, t)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </Text>
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
              <InlineEmpty>
                {t('compute.noVersions')}
              </InlineEmpty>
            }
          />
        )}
      </Card>
      {versions && versions.length > 1 ? (
        <Text style={[styles.footnote, { color: label(mode, 0.35) }]}>
          {t('compute.versionsHint')}
        </Text>
      ) : null}

      <SectionLabel>{t('compute.sectionDetails')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          left={
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t('compute.account')}
            </Text>
          }
          right={
            <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
              {params.accountName ?? '—'}
            </Text>
          }
        />
        <ListRow
          chevron={false}
          left={
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t('compute.updatedAt')}
            </Text>
          }
          right={
            <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
              {params.modifiedOn ? relativeTime(params.modifiedOn, t) : '—'}
            </Text>
          }
        />
        <ListRow
          chevron={false}
          last
          left={
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t('compute.createdAt')}
            </Text>
          }
          right={
            <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
              {params.createdOn ? relativeTime(params.createdOn, t) : '—'}
            </Text>
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
            testID="worker-domain-backdrop"
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
                  {t('compute.addDomain')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  hitSlop={8}
                  onPress={submitDomain}
                  style={[styles.sheetHeaderSide, styles.sheetHeaderRight]}
                  testID="worker-domain-save"
                >
                  {busy ? (
                    <ActivityIndicator color={accent.orange} size="small" />
                  ) : (
                    <Text style={styles.sheetAction}>{t('common.add')}</Text>
                  )}
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { color: label(mode, 0.5) }]}>
                {t('compute.domainLabel')}
              </Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={(hostname) => {
                  setDomainError(null);
                  setDomainSheet({ ...domainSheet, hostname });
                }}
                placeholder={t('compute.domainPlaceholder')}
                placeholderTextColor={label(mode, 0.3)}
                style={[
                  styles.input,
                  { backgroundColor: colors.searchBg, color: colors.text },
                  domainError ? styles.inputError : null,
                ]}
                testID="worker-domain-input"
                value={domainSheet.hostname}
              />
              {domainError ? (
                <Text style={styles.fieldError} testID="worker-domain-error">
                  {domainError}
                </Text>
              ) : null}

              <Text style={[styles.fieldLabel, { color: label(mode, 0.5) }]}>
                {t('compute.zoneLabel')}
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
                        testID={`worker-domain-zone-${zone.id}`}
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
                  {t('compute.errZone')}
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
  chartWrap: {
    padding: 16,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  empty: {
    ...fontFace('bodySmall'),
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
  footnote: {
    ...font('subhead'),
    marginTop: 8,
    paddingHorizontal: 32,
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
  sub: {
    ...fontFace('footnote'),
    marginTop: 2,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
  },
});
