import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  balancerStatus,
  fetchLoadBalancingSnapshot,
  poolStatus,
  type LoadBalancingSnapshot,
} from '@/src/cloudflare/management';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  Card,
  ListRow,
  Pill,
  SectionLabel,
  statusColor,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { label } from '@/src/theme/tokens';

export default function HomeLoadBalancing() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    accountId?: string;
    accountName?: string;
  }>();
  const [snapshot, setSnapshot] = useState<LoadBalancingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchLoadBalancingSnapshot(params.accountId || undefined)
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

  const pageError =
    error ??
    (snapshot && snapshot.balancers.length === 0 && snapshot.issues[0]
      ? cloudflareErrorMessage(snapshot.issues[0].cause)
      : null);

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={pageError}
      loading={!snapshot && !error}
      subtitle={
        params.accountName
          ? params.accountName
          : snapshot
            ? t('lb.subtitle', { count: snapshot.balancers.length })
            : undefined
      }
      title={t('home.mgmtLb')}
    >
      {snapshot && snapshot.balancers.length === 0 ? (
        <Text style={[styles.empty, { color: label(mode, 0.45) }]}>
          {t('lb.empty')}
        </Text>
      ) : (
        snapshot?.balancers.map((balancer) => {
          const status = balancerStatus(balancer);
          return (
            <View key={balancer.id}>
              <View style={styles.header}>
                <SectionLabel>{balancer.name}</SectionLabel>
                <View style={styles.headerMeta}>
                  <Pill status={status} />
                  <Text style={[styles.steering, { color: label(mode, 0.4) }]}>
                    {t(`lb.steering.${balancer.steering}`, {
                      defaultValue: balancer.steering,
                    })}
                  </Text>
                </View>
              </View>
              <Card>
                {balancer.pools.length === 0 ? (
                  <ListRow
                    chevron={false}
                    last
                    left={
                      <Text style={[styles.sub, { color: label(mode, 0.4) }]}>
                        {t('lb.noPools')}
                      </Text>
                    }
                  />
                ) : (
                  balancer.pools.map((pool, index) => {
                    const poolState = poolStatus(pool);
                    return (
                      <ListRow
                        chevron={false}
                        key={pool.id}
                        last={index === balancer.pools.length - 1}
                        left={
                          <View style={styles.row}>
                            <View
                              style={[
                                styles.dot,
                                { backgroundColor: statusColor[poolState] },
                              ]}
                            />
                            <View>
                              <Text
                                style={[styles.name, { color: colors.text }]}
                              >
                                {pool.name}
                              </Text>
                              <Text
                                style={[
                                  styles.sub,
                                  { color: label(mode, 0.4) },
                                ]}
                              >
                                {t('lb.origins', {
                                  healthy: pool.originEnabled,
                                  total: pool.originCount,
                                })}
                                {params.accountName
                                  ? ''
                                  : ` · ${balancer.accountName}`}
                              </Text>
                            </View>
                          </View>
                        }
                      />
                    );
                  })
                )}
              </Card>
            </View>
          );
        })
      )}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 4,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: 16,
  },
  headerMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  steering: {
    fontSize: 11,
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
  },
});
