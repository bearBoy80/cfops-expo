import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  fetchBillingSnapshot,
  groupSubscriptions,
  type BillingSnapshot,
} from '@/src/cloudflare/management';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import { Card, SectionLabel } from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, hairline, label } from '@/src/theme/tokens';
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

  useEffect(() => {
    let active = true;
    void fetchBillingSnapshot(params.accountId || undefined)
      .then((next) => {
        if (active) {
          setSnapshot(next);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cloudflareErrorMessage(cause));
        }
      });
    return () => {
      active = false;
    };
  }, [params.accountId]);

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
  const pageError =
    error ??
    (snapshot && snapshot.subscriptions.length === 0 && snapshot.issues[0]
      ? cloudflareErrorMessage(snapshot.issues[0].cause)
      : null);

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={pageError}
      loading={!snapshot && !error}
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
        <Text style={[styles.empty, { color: label(mode, 0.45) }]}>
          {t('billing.empty')}
        </Text>
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
  empty: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  hero: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
  },
  heroLabel: {
    fontSize: 12,
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
    color: accent.orange,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginRight: 12,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemUsage: {
    fontSize: 12,
    marginTop: 4,
  },
});
