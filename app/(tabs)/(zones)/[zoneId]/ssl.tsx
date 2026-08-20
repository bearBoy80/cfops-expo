import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getZoneSslMode,
  listCertificatePacks,
  type CfCertificatePack,
} from '@/src/cloudflare/api';
import { getBearerForConnection } from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  Card,
  ListRow,
  MetricTile,
  Pill,
  SectionLabel,
  type Status,
  InlineEmpty,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, label } from '@/src/theme/tokens';

const sslLabels: Record<string, string> = {
  off: 'Off',
  flexible: 'Flexible',
  full: 'Full',
  strict: 'Full (strict)',
  origin_pull: 'Strict (origin pull)',
};

const EXPIRING_DAYS = 14;

function daysLeft(pack: CfCertificatePack): number | null {
  if (!pack.expiresOn) {
    return null;
  }
  return Math.floor(
    (new Date(pack.expiresOn).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
}

function certState(pack: CfCertificatePack): 'valid' | 'expiring' | 'expired' | 'pending' {
  if (pack.status !== 'active') {
    return 'pending';
  }
  const days = daysLeft(pack);
  if (days !== null && days < 0) {
    return 'expired';
  }
  if (days !== null && days <= EXPIRING_DAYS) {
    return 'expiring';
  }
  return 'valid';
}

const statePill: Record<ReturnType<typeof certState>, Status> = {
  valid: 'active',
  expiring: 'degraded',
  expired: 'error',
  pending: 'pending',
};

export default function ZoneSsl() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    zoneId: string;
    connectionId: string;
    name?: string;
  }>();
  const [packs, setPacks] = useState<CfCertificatePack[] | null>(null);
  const [sslMode, setSslMode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const bearer = await getBearerForConnection(params.connectionId);
      const [packsResult, sslResult] = await Promise.all([
        listCertificatePacks(bearer, params.zoneId),
        getZoneSslMode(bearer, params.zoneId).catch(() => null),
      ]);
      setPacks(packsResult);
      setSslMode(sslResult);
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    }
  }, [params.zoneId, params.connectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const states = (packs ?? []).map(certState);
  const counts = {
    valid: states.filter((state) => state === 'valid').length,
    expiring: states.filter((state) => state === 'expiring').length,
    expired: states.filter((state) => state === 'expired').length,
  };

  return (
    <ZoneSubpage
      backLabel={params.name ?? t('zone.fallbackTitle')}
      error={error}
      loading={!packs}
      onRefresh={load}
      subtitle={params.name}
      title={t('zone.svcSsl')}
    >
      {packs ? (
        <>
          <View style={styles.tileRow}>
            <MetricTile
              color={accent.green}
              label={t('ssl.valid')}
              value={String(counts.valid)}
            />
            <MetricTile
              color={accent.yellow}
              label={t('ssl.expiring')}
              value={String(counts.expiring)}
            />
            <MetricTile
              color={accent.red}
              label={t('ssl.expired')}
              value={String(counts.expired)}
            />
          </View>

          <SectionLabel>{t('zone.sslMode')}</SectionLabel>
          <Card>
            <ListRow
              chevron={false}
              last
              left={
                <Text style={[styles.rowLabel, { color: colors.text }]}>
                  {t('zone.sslMode')}
                </Text>
              }
              right={
                <Text style={[styles.rowValue, { color: label(mode, 0.5) }]}>
                  {sslMode ? (sslLabels[sslMode] ?? sslMode) : '—'}
                </Text>
              }
            />
          </Card>

          <SectionLabel>{t('ssl.certificates')}</SectionLabel>
          {packs.length > 0 ? (
            <Card>
              {packs.map((pack, index) => {
                const state = certState(pack);
                const days = daysLeft(pack);
                const daysColor =
                  state === 'expired'
                    ? accent.red
                    : state === 'expiring'
                      ? accent.yellow
                      : accent.green;
                return (
                  <ListRow
                    key={pack.id}
                    chevron={false}
                    last={index === packs.length - 1}
                    right={
                      days !== null ? (
                        <Text style={[styles.days, { color: daysColor }]}>
                          {days < 0
                            ? t('ssl.expiredDays', { count: -days })
                            : t('ssl.daysLeft', { count: days })}
                        </Text>
                      ) : undefined
                    }
                    left={
                      <View style={styles.copy}>
                        <View style={styles.hostRow}>
                          <Text
                            numberOfLines={1}
                            style={[styles.host, { color: colors.text }]}
                          >
                            {pack.hosts[0] ?? pack.id}
                          </Text>
                          <Pill status={statePill[state]} />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[styles.sub, { color: label(mode, 0.4) }]}
                        >
                          {[pack.type, pack.issuer].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    }
                  />
                );
              })}
            </Card>
          ) : (
            <InlineEmpty>
              {t('ssl.empty')}
            </InlineEmpty>
          )}
        </>
      ) : null}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    minWidth: 0,
  },
  days: {
    ...fontFace('subhead', '600'),
  },
  host: {
    ...fontFace('bodySmall', '500'),
    flexShrink: 1,
    fontFamily: 'Menlo',
  },
  hostRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rowLabel: {
    ...fontFace('headline', '400'),
  },
  rowValue: {
    ...fontFace('headline', '400'),
  },
  sub: {
    ...fontFace('footnote'),
    marginTop: 2,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 16,
  },
});
