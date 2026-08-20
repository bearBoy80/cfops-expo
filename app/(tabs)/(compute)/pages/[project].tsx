import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  fetchPagesFunctionMetrics,
  type PagesFunctionMetrics,
} from '@/src/cloudflare/analytics';
import { invalidateComputeSnapshot } from '@/src/cloudflare/accountResources';
import {
  addPagesDomain,
  deletePagesDomain,
  getPagesPreviewSetting,
  listPagesDeployments,
  listPagesDomains,
  retryPagesDeployment,
  rollbackPagesDeployment,
  setPagesPreviewSetting,
  type CfPagesDeployment,
  type CfPagesDomain,
  type PagesPreviewSetting,
} from '@/src/cloudflare/api';
import { getBearerForConnection } from '@/src/cloudflare/resources';
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
  type Status,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label } from '@/src/theme/tokens';
import { compactNumber, relativeTime } from '@/src/utils/format';

const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

function deploymentPillStatus(status: CfPagesDeployment['status']): Status {
  switch (status) {
    case 'success':
      return 'active';
    case 'failure':
      return 'error';
    default:
      return 'pending';
  }
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

export default function PagesProjectDetail() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    project: string;
    accountId: string;
    connectionId: string;
    accountName?: string;
    domain?: string;
    framework?: string;
    productionBranch?: string;
    productionScriptName?: string;
  }>();
  const [bearer, setBearer] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<CfPagesDeployment[] | null>(
    null,
  );
  const [domains, setDomains] = useState<CfPagesDomain[] | null>(null);
  const [functionMetrics, setFunctionMetrics] =
    useState<PagesFunctionMetrics | null>(null);
  const [previewSetting, setPreviewSetting] =
    useState<PagesPreviewSetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainSheet, setDomainSheet] = useState<{ name: string } | null>(
    null,
  );
  const [domainError, setDomainError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (resolved: string) => {
      await Promise.all([
        listPagesDeployments(resolved, params.accountId, params.project).then(
          setDeployments,
        ),
        listPagesDomains(resolved, params.accountId, params.project)
          .then(setDomains)
          .catch(() => setDomains([])),
        getPagesPreviewSetting(resolved, params.accountId, params.project)
          .then(setPreviewSetting)
          .catch(() => {}),
        params.productionScriptName
          ? fetchPagesFunctionMetrics(
              resolved,
              params.accountId,
              params.productionScriptName,
            )
              .then(setFunctionMetrics)
              .catch(() => {})
          : Promise.resolve(),
      ]);
    },
    [params.accountId, params.project, params.productionScriptName],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const resolved = await getBearerForConnection(params.connectionId);
      setBearer(resolved);
      await load(resolved);
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    }
  }, [load, params.connectionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Newest production deployment: rolling back to it would be a no-op. */
  const currentProductionId = deployments?.find(
    (deployment) => deployment.environment === 'production',
  )?.id;

  const openDeploymentActions = (deployment: CfPagesDeployment) => {
    if (!bearer || busy) {
      return;
    }
    const shortId = deployment.id.slice(0, 8);
    const canRollback =
      deployment.environment === 'production' &&
      deployment.status === 'success' &&
      deployment.id !== currentProductionId;
    const canRetry = deployment.status === 'failure';
    if (!canRollback && !canRetry) {
      return;
    }

    const run = (
      action: Promise<void>,
      doneMessage: string,
    ) => {
      setBusy(true);
      void action
        .then(async () => {
          // The list row shows the latest deployment status and commit.
          invalidateComputeSnapshot();
          showToast(doneMessage);
          await load(bearer);
        })
        .catch((cause) => {
          showToast(cloudflareErrorMessage(cause), 'error');
        })
        .finally(() => setBusy(false));
    };

    showActionMenu({
      title: t('compute.deploymentTitle', { id: shortId }),
      message: [deployment.branch, deployment.commit]
        .filter(Boolean)
        .join(' · '),
      cancelLabel: t('common.cancel'),
      actions: [
        ...(canRetry
          ? [
              {
                label: t('compute.retry'),
                onPress: () =>
                  run(
                    retryPagesDeployment(
                      bearer,
                      params.accountId,
                      params.project,
                      deployment.id,
                    ),
                    t('compute.retryDone'),
                  ),
              },
            ]
          : []),
        ...(canRollback
          ? [
              {
                label: t('compute.rollback'),
                destructive: true,
                onPress: () =>
                  run(
                    rollbackPagesDeployment(
                      bearer,
                      params.accountId,
                      params.project,
                      deployment.id,
                    ),
                    t('compute.rollbackDone'),
                  ),
              },
            ]
          : []),
      ],
    });
  };

  const togglePreviewDeployments = (enabled: boolean) => {
    if (!bearer || busy) {
      return;
    }
    const previous = previewSetting;
    const next = enabled ? 'all' : 'none';
    setPreviewSetting(next);
    setBusy(true);
    void setPagesPreviewSetting(bearer, params.accountId, params.project, next)
      .then(() => {
        showToast(t('compute.settingSaved'));
      })
      .catch((cause) => {
        setPreviewSetting(previous);
        showToast(cloudflareErrorMessage(cause), 'error');
      })
      .finally(() => setBusy(false));
  };

  const submitDomain = () => {
    if (!domainSheet || !bearer) {
      return;
    }
    const name = domainSheet.name.trim().toLowerCase();
    if (!HOSTNAME_PATTERN.test(name)) {
      setDomainError(t('compute.errDomain'));
      return;
    }
    setBusy(true);
    void addPagesDomain(bearer, params.accountId, params.project, name)
      .then(async () => {
        // The list row shows the primary domain, i.e. the first of domains.
        invalidateComputeSnapshot();
        setDomainSheet(null);
        showToast(t('compute.domainAdded'));
        await load(bearer);
      })
      .catch((cause) => {
        // Toasts render below RN modals, so surface the failure inline.
        setDomainError(cloudflareErrorMessage(cause));
      })
      .finally(() => setBusy(false));
  };

  const confirmRemoveDomain = (domain: CfPagesDomain) => {
    if (!bearer || busy) {
      return;
    }
    showActionMenu({
      title: domain.name,
      message: t('compute.removeDomainConfirm', { name: domain.name }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('compute.removeDomain'),
          destructive: true,
          onPress: () => {
            setBusy(true);
            void deletePagesDomain(
              bearer,
              params.accountId,
              params.project,
              domain.name,
            )
              .then(async () => {
                invalidateComputeSnapshot();
                showToast(t('compute.domainRemoved'));
                await load(bearer);
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

  const overview = [
    { key: 'domain', label: t('compute.domainLabel'), value: params.domain },
    {
      key: 'framework',
      label: t('compute.frameworkLabel'),
      value: params.framework,
    },
    {
      key: 'branch',
      label: t('compute.branchLabel'),
      value: params.productionBranch,
    },
    { key: 'account', label: t('compute.account'), value: params.accountName },
  ].filter((row) => Boolean(row.value));

  return (
    <ZoneSubpage
      backLabel={t('compute.title')}
      error={error}
      loading={!deployments && !error}
      onRefresh={refresh}
      subtitle={params.accountName}
      title={params.project}
    >
      {overview.length > 0 ? (
        <>
          <SectionLabel>{t('compute.sectionOverview')}</SectionLabel>
          <Card>
            {overview.map((row, index) => (
              <ListRow
                key={row.key}
                chevron={false}
                last={index === overview.length - 1}
                left={
                  <Text style={[styles.rowLabel, { color: colors.text }]}>
                    {row.label}
                  </Text>
                }
                right={
                  <Text
                    numberOfLines={1}
                    style={[styles.rowValue, { color: label(mode, 0.5) }]}
                  >
                    {row.value}
                  </Text>
                }
              />
            ))}
          </Card>
        </>
      ) : null}

      {params.productionScriptName ? (
        <>
          <SectionLabel>{t('compute.sectionFunctions')}</SectionLabel>
          <View style={styles.tileRow}>
            <MetricTile
              Icon={Zap}
              color={accent.orange}
              label={t('compute.functionInvocations')}
              sub={t('storage.last24h')}
              value={
                functionMetrics
                  ? compactNumber(functionMetrics.requests)
                  : '—'
              }
            />
            <MetricTile
              Icon={AlertTriangle}
              color={accent.red}
              label={t('compute.errors')}
              value={
                functionMetrics ? compactNumber(functionMetrics.errors) : '—'
              }
            />
          </View>
          {functionMetrics && functionMetrics.series.length > 1 ? (
            <View style={styles.chartCard}>
              <Card>
                <View style={styles.chartWrap}>
                  <AreaChart
                    color={accent.orange}
                    data={functionMetrics.series}
                  />
                </View>
              </Card>
            </View>
          ) : null}
        </>
      ) : null}

      {previewSetting ? (
        <>
          <SectionLabel>{t('compute.sectionAccess')}</SectionLabel>
          <Card>
            <ToggleRow
              label={t('compute.previewDeploymentsLabel')}
              last
              sub={t('compute.previewDeploymentsSub')}
              testID="pages-toggle-previews"
              value={previewSetting !== 'none'}
              onValueChange={togglePreviewDeployments}
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
            onPress={() => confirmRemoveDomain(domain)}
            testID={`pages-domain-${domain.name}`}
            right={<Pill status={domainPillStatus(domain.status)} />}
            left={
              <Text
                numberOfLines={1}
                style={[styles.mono, { color: colors.text }]}
              >
                {domain.name}
              </Text>
            }
          />
        ))}
        <ListRow
          chevron={false}
          last
          onPress={() => {
            setDomainError(null);
            setDomainSheet({ name: '' });
          }}
          testID="pages-add-domain"
          left={<Text style={styles.addRow}>{t('compute.addDomain')}</Text>}
        />
      </Card>

      <SectionLabel>{t('compute.sectionDeployments')}</SectionLabel>
      {deployments && deployments.length > 0 ? (
        <>
        <Card>
          {deployments.map((deployment, index) => {
            const actionable =
              (deployment.environment === 'production' &&
                deployment.status === 'success' &&
                deployment.id !== currentProductionId) ||
              deployment.status === 'failure';
            return (
              <ListRow
                key={deployment.id}
                chevron={actionable}
                last={index === deployments.length - 1}
                onPress={
                  actionable
                    ? () => openDeploymentActions(deployment)
                    : undefined
                }
                testID={`pages-deployment-${deployment.id}`}
                right={
                  deployment.createdOn ? (
                    <Text style={[styles.time, { color: label(mode, 0.4) }]}>
                      {relativeTime(deployment.createdOn, t)}
                    </Text>
                  ) : undefined
                }
                left={
                  <View style={styles.copy}>
                    <View style={styles.titleLine}>
                      <Pill
                        status={deploymentPillStatus(deployment.status)}
                      />
                      <Text
                        numberOfLines={1}
                        style={[styles.env, { color: colors.text }]}
                      >
                        {deployment.environment === 'production'
                          ? t('compute.envProduction')
                          : t('compute.envPreview')}
                      </Text>
                    </View>
                    {deployment.branch || deployment.commit ? (
                      <Text
                        numberOfLines={1}
                        style={[styles.sub, { color: label(mode, 0.4) }]}
                      >
                        {[deployment.branch, deployment.commit]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            );
          })}
        </Card>
        <Text style={[styles.footnote, { color: label(mode, 0.35) }]}>
          {t('compute.deploymentsHint')}
        </Text>
        </>
      ) : deployments ? (
        <Text style={[styles.empty, styles.emptyBlock, { color: label(mode, 0.4) }]}>
          {t('compute.noDeployments')}
        </Text>
      ) : null}

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
            testID="pages-domain-backdrop"
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
                  testID="pages-domain-save"
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
                onChangeText={(name) => {
                  setDomainError(null);
                  setDomainSheet({ name });
                }}
                placeholder={t('compute.domainPlaceholder')}
                placeholderTextColor={label(mode, 0.3)}
                style={[
                  styles.input,
                  { backgroundColor: colors.searchBg, color: colors.text },
                  domainError ? styles.inputError : null,
                ]}
                testID="pages-domain-input"
                value={domainSheet.name}
              />
              {domainError ? (
                <Text style={styles.fieldError} testID="pages-domain-error">
                  {domainError}
                </Text>
              ) : null}

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
  chartCard: {
    marginTop: 10,
  },
  chartWrap: {
    padding: 16,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  empty: {
    fontSize: 14,
  },
  emptyBlock: {
    marginTop: 8,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  env: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
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
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 32,
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
  rowLabel: {
    fontSize: 17,
  },
  rowValue: {
    fontSize: 15,
    marginLeft: 12,
    maxWidth: 200,
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
    fontFamily: 'Menlo',
    fontSize: 11,
    marginTop: 3,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  time: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
