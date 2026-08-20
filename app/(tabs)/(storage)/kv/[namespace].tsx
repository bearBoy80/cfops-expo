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
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  KeyRound,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  deleteKvKeys,
  deleteKvNamespace,
  getKvEntries,
  listKvKeys,
  putKvValue,
  type CfKvEntry,
  type CfKvKey,
} from '@/src/cloudflare/api';
import { invalidateStorageSnapshot } from '@/src/cloudflare/accountResources';
import {
  fetchStorageMetrics,
  invalidateStorageMetrics,
  type KvNamespaceMetrics,
} from '@/src/cloudflare/analytics';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  Card,
  ListRow,
  MetricTile,
  SectionLabel,
  showActionMenu,
  useToast,
  InlineEmpty,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useSequencer } from '@/src/state/useSequencedLoad';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, foreground, label } from '@/src/theme/tokens';
import { compactNumber, formatBytes } from '@/src/utils/format';
import { haptics } from '@/src/utils/haptics';

/**
 * A namespace can hold far more keys than a phone should fetch values for, and
 * a single value can be megabytes, so only the first page gets a preview. Rows
 * past it still open in the editor, which reads its own value on demand.
 */
const PREVIEW_KEY_LIMIT = 100;

/** Values are arbitrary blobs; the row shows one line, so flatten and clip. */
function previewOf(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240);
}

/** The API's limit on a key name, measured in UTF-8 bytes rather than chars. */
const KEY_MAX_BYTES = 512;

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Translation key of the first problem with a new key name, if any. */
function keyNameProblem(
  name: string,
  existing: readonly CfKvKey[],
): string | null {
  if (name.length === 0 || /\s/.test(name)) {
    return 'storage.errKeyName';
  }
  if (utf8Bytes(name) > KEY_MAX_BYTES) {
    return 'storage.errKeyLength';
  }
  /*
   * A write is an upsert, so without this an "Add Key" would silently replace
   * an existing value. Only the pages already listed are known here, which is
   * enough for the case that matters: retyping a key that is on screen.
   */
  if (existing.some((key) => key.name === name)) {
    return 'storage.errKeyExists';
  }
  return null;
}

interface ValueSheet {
  /** Creating also needs a name, so the sheet grows a second field. */
  mode: 'create' | 'edit';
  key: string;
  value: string;
  /** The value is re-read on open, so a save cannot overwrite a newer write. */
  loading: boolean;
  entry: CfKvEntry | null;
  error: string | null;
  keyError: string | null;
}

export default function KvNamespaceDetail() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    namespace: string;
    accountId: string;
    connectionId: string;
    accountName?: string;
    title?: string;
  }>();
  const [bearer, setBearer] = useState<string | null>(null);
  const [keys, setKeys] = useState<CfKvKey[] | null>(null);
  /** Row previews, keyed by key name. Null when the values could not be read. */
  const [previews, setPreviews] = useState<Map<string, string> | null>(null);
  const [metrics, setMetrics] = useState<KvNamespaceMetrics | null>(null);
  /** Multi-select mode, entered from the header or a row's menu. */
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [sheet, setSheet] = useState<ValueSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const sequence = useSequencer();

  const load = useCallback(
    () =>
      sequence(async (ifCurrent) => {
        ifCurrent(setError)(null);
        try {
          const resolved = await getBearerForConnection(params.connectionId);
          ifCurrent(setBearer)(resolved);
          await Promise.all([
            listKvKeys(resolved, params.accountId, params.namespace)
              .then(async (items) => {
                ifCurrent(setKeys)(items);
                try {
                  const entries = await getKvEntries(
                    resolved,
                    params.accountId,
                    params.namespace,
                    items.slice(0, PREVIEW_KEY_LIMIT).map((item) => item.name),
                  );
                  ifCurrent(setPreviews)(
                    new Map(
                      [...entries].map(([key, entry]) => [
                        key,
                        previewOf(entry.value),
                      ]),
                    ),
                  );
                } catch {
                  // Reading values needs a permission listing does not, so the
                  // key list stays useful on its own.
                  ifCurrent(setPreviews)(null);
                }
              })
              .catch(() => {
                ifCurrent(setKeys)([]);
              }),
            fetchStorageMetrics(resolved, params.accountId)
              .then((accountMetrics) => {
                ifCurrent(setMetrics)(
                  accountMetrics.kv.get(params.namespace) ?? null,
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
    [params.accountId, params.connectionId, params.namespace, sequence],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const keyCount =
    metrics != null || keys != null
      ? Math.max(metrics?.keyCount ?? 0, keys?.length ?? 0)
      : null;

  const allSelected =
    !!keys && keys.length > 0 && selected.length === keys.length;
  const deleteDisabled = busy || selected.length === 0;
  const keyRows = keys ?? [];
  /** Hidden in selection mode, where the list is for picking, not adding. */
  const showAddKey = !editing && keys !== null;

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

  const toggleKey = (name: string) => {
    haptics.selection();
    setSelected((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  };

  const runDelete = (names: string[]) => {
    if (!bearer) {
      return;
    }
    setBusy(true);
    void deleteKvKeys(bearer, params.accountId, params.namespace, names)
      .then((outcome) => {
        // Only clear what actually went away, so a retry keeps the failures
        // selected instead of silently dropping them.
        setSelected((current) =>
          current.filter((name) => !outcome.deleted.includes(name)),
        );
        invalidateStorageMetrics(params.accountId);
        if (outcome.failed.length === 0) {
          // Nothing is left to act on, so leave selection mode rather than
          // strand the user in a screen of empty checkboxes.
          setEditing(false);
          showToast(t('storage.keysDeleted', { count: outcome.deleted.length }));
        } else {
          showToast(
            t('storage.keysDeletedPartial', {
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

  const openCreator = () => {
    setSheet({
      mode: 'create',
      key: '',
      value: '',
      loading: false,
      entry: null,
      error: null,
      keyError: null,
    });
  };

  const openEditor = (name: string) => {
    if (!bearer) {
      return;
    }
    setSheet({
      mode: 'edit',
      key: name,
      value: '',
      loading: true,
      entry: null,
      error: null,
      keyError: null,
    });
    void getKvEntries(bearer, params.accountId, params.namespace, [name])
      .then((entries) => {
        const entry = entries.get(name) ?? {
          value: '',
          metadata: null,
          expiration: null,
        };
        setSheet((current) =>
          current?.key === name
            ? { ...current, value: entry.value, entry, loading: false }
            : current,
        );
      })
      .catch((cause) => {
        setSheet((current) =>
          current?.key === name
            ? {
                ...current,
                loading: false,
                error: cloudflareErrorMessage(cause),
              }
            : current,
        );
      });
  };

  const submitValue = () => {
    if (!bearer || !sheet || sheet.loading || busy) {
      return;
    }
    const { mode: sheetMode, key, value, entry } = sheet;
    if (sheetMode === 'create') {
      const problem = keyNameProblem(key, keys ?? []);
      if (problem) {
        setSheet({ ...sheet, keyError: t(problem) });
        return;
      }
    }
    setBusy(true);
    void putKvValue(bearer, params.accountId, params.namespace, {
      key,
      value,
      metadata: entry?.metadata,
      expiration: entry?.expiration,
    })
      .then(() => {
        setSheet(null);
        invalidateStorageMetrics(params.accountId);
        if (sheetMode === 'create') {
          showToast(t('storage.keyCreated'));
          // A new key changes the list itself, so it has to come back from the
          // API rather than be guessed at locally.
          return load();
        }
        // An edit leaves the list alone, so only the row preview moves.
        setPreviews((current) =>
          current ? new Map(current).set(key, previewOf(value)) : current,
        );
        showToast(t('storage.valueSaved'));
      })
      .catch((cause) => {
        setSheet((current) =>
          current
            ? { ...current, error: cloudflareErrorMessage(cause) }
            : current,
        );
      })
      .finally(() => setBusy(false));
  };

  /**
   * Row menu behind the chevron: the three things you can do with one key.
   * As in the R2 object list, the destructive item runs straight away — the
   * sheet names the key and offers Cancel, so it is the confirmation.
   */
  const openKeyMenu = (name: string) => {
    if (!bearer || busy) {
      return;
    }
    showActionMenu({
      title: name,
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.editValue'),
          onPress: () => openEditor(name),
        },
        {
          label: t('storage.deleteKey'),
          destructive: true,
          onPress: () => runDelete([name]),
        },
        {
          label: t('storage.select'),
          // Starts the selection from the key that was tapped.
          onPress: () => {
            setEditing(true);
            setSelected([name]);
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
    const names = selected;
    showActionMenu({
      title: t('storage.deleteSelectedKeys', { count: names.length }),
      message: t('storage.deleteKeysConfirm', { count: names.length }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.deleteKeys'),
          destructive: true,
          onPress: () => runDelete(names),
        },
      ],
    });
  };

  const confirmDelete = useCallback(() => {
    if (busy) {
      return;
    }
    showActionMenu({
      title: t('storage.deleteNamespace'),
      message: t('storage.deleteNamespaceConfirm', {
        name: params.title ?? params.namespace,
      }),
      cancelLabel: t('common.cancel'),
      actions: [
        {
          label: t('storage.deleteNamespace'),
          destructive: true,
          onPress: () => {
            setBusy(true);
            void getBearerForConnection(params.connectionId)
              .then((resolved) =>
                deleteKvNamespace(resolved, params.accountId, params.namespace),
              )
              .then(() => {
                invalidateStorageSnapshot();
                invalidateStorageMetrics(params.accountId);
                showToast(t('storage.namespaceDeleted'));
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
  }, [
    busy,
    params.accountId,
    params.connectionId,
    params.namespace,
    params.title,
    router,
    showToast,
    t,
  ]);

  return (
    <ZoneSubpage
      backLabel={t('storage.title')}
      error={error}
      footer={
        /*
         * Present for the whole of selection mode, with the destructive action
         * dimmed until something is picked, so an empty selection cannot strand
         * the user in a screen of empty checkboxes.
         */
        editing ? (
          <View style={styles.keyToolbar}>
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
                testID="kv-exit-select"
              >
                <Text style={styles.toolbarAction}>
                  {t('storage.selectDone')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() =>
                  setSelected(
                    allSelected ? [] : (keys ?? []).map((item) => item.name),
                  )
                }
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                testID="kv-select-all"
              >
                <Text style={styles.toolbarAction}>
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
              testID="kv-delete-keys"
            >
              <Text style={styles.toolbarDestructive}>
                {selected.length === 0
                  ? t('storage.deleteKeys')
                  : t('storage.deleteSelectedKeys', { count: selected.length })}
              </Text>
            </Pressable>
          </View>
        ) : null
      }
      headerRight={
        // Entry only: once in selection mode the pinned toolbar owns the exit,
        // so a second control here would just duplicate it — and scroll away.
        !editing && keys && keys.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={toggleEditing}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            testID="kv-toggle-select"
          >
            <Text style={styles.toolbarAction}>{t('storage.select')}</Text>
          </Pressable>
        ) : undefined
      }
      loading={loading}
      onRefresh={load}
      subtitle={params.accountName}
      title={params.title ?? params.namespace}
    >
      <View style={styles.tileRow}>
        <MetricTile
          Icon={KeyRound}
          color={accent.blue}
          label={t('storage.sectionKeys')}
          value={keyCount != null ? compactNumber(keyCount) : '—'}
        />
        <MetricTile
          Icon={KeyRound}
          color={accent.orange}
          label={t('storage.stored')}
          value={metrics ? formatBytes(metrics.byteCount) : '—'}
        />
      </View>
      <View style={styles.tileRow}>
        <MetricTile
          Icon={ArrowDownToLine}
          color={accent.green}
          label={t('storage.readsLabel')}
          sub={t('storage.last24h')}
          value={metrics ? compactNumber(metrics.reads) : '—'}
        />
        <MetricTile
          Icon={ArrowUpFromLine}
          color={accent.purple}
          label={t('storage.writesLabel')}
          sub={t('storage.last24h')}
          value={metrics ? compactNumber(metrics.writes) : '—'}
        />
      </View>

      <SectionLabel>{t('storage.sectionDetails')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          last
          left={
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {t('storage.account')}
            </Text>
          }
          right={
            <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
              {params.accountName ?? '—'}
            </Text>
          }
        />
      </Card>

      <SectionLabel>
        {t('storage.sectionKeys')}
        {keys ? ` · ${keys.length}` : ''}
      </SectionLabel>
      {keys?.length === 0 ? (
        <InlineEmpty>
          {t('storage.noKeys')}
        </InlineEmpty>
      ) : null}
      <Card>
        {keyRows.map((key, index) => {
          const picked = selected.includes(key.name);
          const preview = previews?.get(key.name);
          return (
            <ListRow
              key={key.name}
              // The chevron is the visible way in to the row's actions; in
              // selection mode the checkbox takes over that slot.
              chevron={!editing}
              last={!showAddKey && index === keyRows.length - 1}
              onPress={
                busy
                  ? undefined
                  : editing
                    ? () => toggleKey(key.name)
                    : () => openKeyMenu(key.name)
              }
              testID={`kv-key-${index}`}
              right={
                editing ? (
                  <View
                    style={[
                      styles.checkbox,
                      picked
                        ? {
                            backgroundColor: accent.orange,
                            borderColor: accent.orange,
                          }
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
                    style={[styles.mono, { color: colors.text }]}
                  >
                    {key.name}
                  </Text>
                  {preview !== undefined ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.keyValue, { color: label(mode, 0.4) }]}
                      testID={`kv-value-${index}`}
                    >
                      {preview === '' ? t('storage.valueEmpty') : preview}
                    </Text>
                  ) : null}
                </View>
              }
            />
          );
        })}
        {showAddKey ? (
          <ListRow
            chevron={false}
            last
            onPress={busy ? undefined : openCreator}
            testID="kv-add-key"
            left={<Text style={styles.addRow}>{t('storage.addKey')}</Text>}
          />
        ) : null}
      </Card>

      <SectionLabel>{t('storage.sectionActions')}</SectionLabel>
      <Card>
        <ListRow
          chevron={false}
          last
          onPress={busy ? undefined : confirmDelete}
          testID="kv-delete-namespace"
          left={
            <Text style={styles.deleteLabel}>
              {t('storage.deleteNamespace')}
            </Text>
          }
        />
      </Card>

      <Modal
        animationType="slide"
        onRequestClose={() => setSheet(null)}
        transparent
        visible={sheet !== null}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetBackdropWrap}
        >
          <Pressable
            onPress={() => setSheet(null)}
            style={styles.sheetBackdrop}
            testID="kv-value-backdrop"
          />
          {sheet ? (
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
                  onPress={() => setSheet(null)}
                  style={styles.sheetHeaderSide}
                >
                  <Text style={styles.sheetCancel}>{t('common.cancel')}</Text>
                </Pressable>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.sheetTitle,
                    sheet.mode === 'edit' ? styles.sheetTitleKey : null,
                    { color: colors.text },
                  ]}
                >
                  {sheet.mode === 'create' ? t('storage.addKey') : sheet.key}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  // Saving before the current value has arrived would write the
                  // empty placeholder over it.
                  disabled={busy || sheet.loading}
                  hitSlop={8}
                  onPress={submitValue}
                  style={[styles.sheetHeaderSide, styles.sheetHeaderRight]}
                  testID="kv-value-save"
                >
                  {busy ? (
                    <ActivityIndicator color={accent.orange} size="small" />
                  ) : (
                    <Text
                      style={[
                        styles.sheetAction,
                        sheet.loading ? styles.sheetActionDisabled : null,
                      ]}
                    >
                      {sheet.mode === 'create'
                        ? t('common.add')
                        : t('common.save')}
                    </Text>
                  )}
                </Pressable>
              </View>

              {sheet.mode === 'create' ? (
                <>
                  <Text
                    style={[styles.fieldLabel, { color: label(mode, 0.5) }]}
                  >
                    {t('storage.keyLabel')}
                  </Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    onChangeText={(key) =>
                      setSheet((current) =>
                        current ? { ...current, key, keyError: null } : current,
                      )
                    }
                    placeholder={t('storage.keyPlaceholder')}
                    placeholderTextColor={label(mode, 0.3)}
                    style={[
                      styles.keyInput,
                      { backgroundColor: colors.searchBg, color: colors.text },
                      sheet.keyError ? styles.inputError : null,
                    ]}
                    testID="kv-key-input"
                    value={sheet.key}
                  />
                  {sheet.keyError ? (
                    <Text style={styles.fieldError} testID="kv-key-error">
                      {sheet.keyError}
                    </Text>
                  ) : null}
                </>
              ) : null}

              <Text style={[styles.fieldLabel, { color: label(mode, 0.5) }]}>
                {t('storage.valueLabel')}
              </Text>
              {sheet.loading ? (
                <View style={styles.valueLoading}>
                  <ActivityIndicator color={accent.orange} size="small" />
                </View>
              ) : (
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  onChangeText={(value) =>
                    setSheet((current) =>
                      current ? { ...current, value, error: null } : current,
                    )
                  }
                  placeholder={t('storage.valuePlaceholder')}
                  placeholderTextColor={label(mode, 0.3)}
                  style={[
                    styles.valueInput,
                    { backgroundColor: colors.searchBg, color: colors.text },
                    sheet.error ? styles.inputError : null,
                  ]}
                  testID="kv-value-input"
                  value={sheet.value}
                />
              )}
              {sheet.error ? (
                <Text style={styles.fieldError} testID="kv-value-error">
                  {sheet.error}
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
    ...fontFace('headline', '400'),
    color: accent.orange,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  deleteLabel: {
    ...fontFace('headline', '400'),
    color: accent.red,
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
  inputError: {
    borderColor: accent.red,
    borderWidth: 1,
  },
  keyToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Standard toolbar row height, so both labels are comfortably tappable.
    minHeight: 44,
  },
  keyInput: {
    ...fontFace('body'),
    borderRadius: 10,
    fontFamily: 'Menlo',
    marginHorizontal: 16,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  keyValue: {
    ...fontFace('footnote'),
    fontFamily: 'Menlo',
    marginTop: 2,
  },
  mono: {
    ...fontFace('subhead'),
    fontFamily: 'Menlo',
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
  sheetActionDisabled: {
    opacity: 0.35,
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
  /** Editing puts the key name itself in the title, so it reads as a key. */
  sheetTitleKey: {
    ...fontFace('body'),
    fontFamily: 'Menlo',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  toolbarAction: {
    ...fontFace('bodyLarge'),
    color: accent.orange,
  },
  /*
   * Both toolbar sides are text buttons, as iOS toolbars are. A filled
   * destructive Button would be invisible here: its background is `surface`
   * and the toolbar is `tabbar`, so only the label would show.
   */
  toolbarDestructive: {
    ...fontFace('bodyLarge', '600'),
    color: accent.red,
  },
  /** Mode controls sit together, away from the destructive action. */
  toolbarGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 20,
  },
  valueInput: {
    ...fontFace('bodySmall'),
    borderRadius: 10,
    fontFamily: 'Menlo',
    marginHorizontal: 16,
    // Tall enough that a multi-line value is legible without scrolling.
    minHeight: 132,
    paddingHorizontal: 12,
    paddingVertical: 11,
    textAlignVertical: 'top',
  },
  valueLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    minHeight: 132,
  },
});
