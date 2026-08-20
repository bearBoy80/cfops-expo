import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  fetchBillingSnapshot,
  groupSubscriptions,
  type BillingSnapshot,
} from '@/src/cloudflare/management';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import { Card, SectionLabel, InlineEmpty } from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, hairline, label } from '@/src/theme/tokens';
import { formatCurrency } from '@/src/utils/format';

export default function HomeBilling() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    accountId?: string;
    accountName?: string;
  }>();
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchBillingSnapshot(params.accountId || undefined);
      setSnapshot(next);
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    }
  }, [params.accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(
    () => groupSubscriptions(snapshot?.subscriptions ?? []),
    [snapshot],
  );
  const total = (snapshot?.subscriptions ?? []).reduce(
    (sum, item) => sum + item.price,
    0,
  );
  const currency = items[0]?.currency ?? 'USD';
  const accounts = new Set(items.map((item) => item.accountId));
  const showAccount = !params.accountName && accounts.size > 1;
  // Subscriptions need `Billing Read`, which has no OAuth scope, so the generic
  // "add the permission" error would send the user looking for a setting that
  // does not exist.
  const missingPermission =
    !!snapshot &&
    snapshot.subscriptions.length === 0 &&
    snapshot.issues.some((issue) => issue.cause.code === 'forbidden');
  const pageError =
    error ??
    (snapshot &&
    snapshot.subscriptions.length === 0 &&
    snapshot.issues[0] &&
    !missingPermission
      ? cloudflareErrorMessage(snapshot.issues[0].cause)
      : null);

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={pageError}
      loading={!snapshot && !error}
      onRefresh={load}
      subtitle={params.accountName || t('home.mgmtBillingSub')}
      title={t('home.mgmtBilling')}
    >
      <View style={[styles.hero, { backgroundColor: colors.surface }]}>
        <Text style={[styles.heroLabel, { color: label(mode, 0.5) }]}>
          {t('billing.estimated')}
        </Text>
        <Text style={[styles.heroValue, { color: colors.text }]}>
          {items.length > 0 ? formatCurrency(total, currency) : '—'}
        </Text>
      </View>

      <SectionLabel>{t('billing.sectionUsage')}</SectionLabel>
      {items.length === 0 ? (
        <InlineEmpty>
          {t(missingPermission ? 'billing.permissionHint' : 'billing.empty')}
        </InlineEmpty>
      ) : (
        <Card>
          {items.map((item, index) => (
            <View
              key={`${item.accountId}-${item.name}-${item.price}-${index}`}
              style={[
                styles.item,
                index < items.length - 1
                  ? {
                      borderBottomColor: hairline(mode, 0.06),
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    }
                  : null,
              ]}
            >
              <View style={styles.itemRow}>
                <Text
                  numberOfLines={1}
                  style={[styles.itemName, { color: colors.text }]}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    styles.itemCost,
                    item.price <= 0 ? { color: label(mode, 0.4) } : null,
                  ]}
                >
                  {item.price > 0
                    ? formatCurrency(item.price * item.count, item.currency)
                    : t('billing.free')}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={[styles.itemUsage, { color: label(mode, 0.4) }]}
              >
                {[
                  item.frequency
                    ? t(`billing.frequency.${item.frequency}`, {
                        defaultValue: item.frequency,
                      })
                    : null,
                  item.count > 1
                    ? t('billing.copies', { count: item.count })
                    : null,
                  showAccount ? item.accountName : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
  },
  heroLabel: {
    ...fontFace('footnote'),
  },
  heroValue: {
    fontSize: 32,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 4,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemCost: {
    ...fontFace('body', '600'),
    color: accent.orange,
    fontVariant: ['tabular-nums'],
  },
  itemName: {
    ...fontFace('bodyLarge', '500'),
    flex: 1,
    marginRight: 12,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemUsage: {
    ...fontFace('footnote'),
    marginTop: 4,
  },
});
