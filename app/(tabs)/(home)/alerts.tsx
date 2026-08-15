import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Bell,
  Database,
  Lock,
  Server,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import {
  alertStatus,
  fetchAlertsSnapshot,
  type AlertsSnapshot,
} from '@/src/cloudflare/management';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import { Card, ListRow, Pill, SectionLabel } from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label, tint } from '@/src/theme/tokens';
import { relativeTime } from '@/src/utils/format';

function alertIcon(type: string): LucideIcon {
  const value = type.toLowerCase();
  if (/ssl|cert/.test(value)) {
    return Lock;
  }
  if (/worker|cpu/.test(value)) {
    return Zap;
  }
  if (/ddos|dos_attack|waf|firewall/.test(value)) {
    return Shield;
  }
  if (/origin|health|pool/.test(value)) {
    return Server;
  }
  if (/billing|r2|storage/.test(value)) {
    return Database;
  }
  if (/5xx|error|spike/.test(value)) {
    return Activity;
  }
  return Bell;
}

export default function HomeAlerts() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const params = useLocalSearchParams<{
    accountId?: string;
    accountName?: string;
  }>();
  const [snapshot, setSnapshot] = useState<AlertsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAlertsSnapshot(params.accountId || undefined)
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

  const missingPermission =
    !!snapshot &&
    snapshot.alerts.length === 0 &&
    snapshot.issues.some((issue) => issue.cause.code === 'forbidden');
  const pageError =
    error ??
    (snapshot &&
    snapshot.alerts.length === 0 &&
    snapshot.issues[0] &&
    !missingPermission
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
            ? t('alerts.subtitle', { count: snapshot.alerts.length })
            : undefined
      }
      title={t('home.mgmtAlerts')}
    >
      <SectionLabel>{t('alerts.sectionActive')}</SectionLabel>
      {snapshot && snapshot.alerts.length === 0 ? (
        <Text style={[styles.empty, { color: label(mode, 0.45) }]}>
          {t(missingPermission ? 'alerts.permissionHint' : 'alerts.empty')}
        </Text>
      ) : (
        <Card>
          {snapshot?.alerts.map((item, index) => {
            const status = alertStatus(item.type);
            const Icon = alertIcon(item.type);
            const color =
              status === 'error'
                ? accent.red
                : status === 'degraded'
                  ? accent.yellow
                  : accent.blue;
            return (
              <ListRow
                chevron={false}
                key={item.id}
                last={index === snapshot.alerts.length - 1}
                left={
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.icon,
                        { backgroundColor: tint(color, '22') },
                      ]}
                    >
                      <Icon
                        accessibilityElementsHidden
                        color={color}
                        size={16}
                      />
                    </View>
                    <View style={styles.copy}>
                      <View style={styles.titleRow}>
                        <Text
                          numberOfLines={1}
                          style={[styles.title, { color: colors.text }]}
                        >
                          {item.title}
                        </Text>
                        <Pill status={status} />
                      </View>
                      <Text
                        numberOfLines={2}
                        style={[styles.sub, { color: label(mode, 0.4) }]}
                      >
                        {[
                          item.detail,
                          item.accountName,
                          item.sent ? relativeTime(item.sent, t) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                }
              />
            );
          })}
        </Card>
      )}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    minWidth: 0,
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  sub: {
    fontSize: 12,
    marginTop: 3,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
