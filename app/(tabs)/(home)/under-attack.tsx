import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react-native';
import {
  getZoneSecurityLevel,
  setZoneSecurityLevel,
  type ZoneSecurityLevel,
} from '@/src/cloudflare/api';
import {
  fetchZonesSnapshot,
  getBearerForConnection,
  type ZoneListItem,
} from '@/src/cloudflare/resources';
import { ZoneSubpage } from '@/src/components/ZoneSubpage';
import {
  Card,
  ToggleRow,
  showActionMenu,
  useToast,
} from '@/src/components/ui';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label } from '@/src/theme/tokens';

const FALLBACK_LEVEL: ZoneSecurityLevel = 'medium';

function isSecurityLevel(value: string | null): value is ZoneSecurityLevel {
  return (
    value === 'off' ||
    value === 'essentially_off' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'under_attack'
  );
}

export default function HomeUnderAttack() {
  const { t } = useTranslation();
  const { mode } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ accountId?: string }>();
  const [zones, setZones] = useState<ZoneListItem[]>([]);
  const [levels, setLevels] = useState<Record<string, ZoneSecurityLevel | null>>(
    {},
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const previousLevels = useRef<Record<string, ZoneSecurityLevel>>({});

  useEffect(() => {
    let active = true;
    const accountId = params.accountId || undefined;

    void fetchZonesSnapshot()
      .then(async (snapshot) => {
        const scoped = snapshot.zones.filter(
          (zone) => !accountId || zone.accountId === accountId,
        );
        if (!active) {
          return;
        }
        setZones(scoped);

        const entries = await Promise.all(
          scoped.map(async (zone) => {
            try {
              const bearer = await getBearerForConnection(zone.connectionId);
              const level = await getZoneSecurityLevel(bearer, zone.id);
              return [zone.id, level] as const;
            } catch {
              return [zone.id, null] as const;
            }
          }),
        );
        if (!active) {
          return;
        }

        const next: Record<string, ZoneSecurityLevel | null> = {};
        const remembered: Record<string, ZoneSecurityLevel> = {};
        for (const [zoneId, level] of entries) {
          next[zoneId] = level;
          if (level && level !== 'under_attack') {
            remembered[zoneId] = level;
          }
        }
        previousLevels.current = remembered;
        setLevels(next);
      })
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
  }, [params.accountId]);

  const applyLevel = async (zone: ZoneListItem, value: ZoneSecurityLevel) => {
    setPendingId(zone.id);
    try {
      const bearer = await getBearerForConnection(zone.connectionId);
      await setZoneSecurityLevel(bearer, zone.id, value);
      setLevels((current) => ({ ...current, [zone.id]: value }));
      showToast(
        value === 'under_attack'
          ? t('home.underAttackOn')
          : t('home.underAttackOff'),
      );
    } catch (cause) {
      showToast(cloudflareErrorMessage(cause), 'error');
    } finally {
      setPendingId(null);
    }
  };

  const onToggle = (zone: ZoneListItem, enabled: boolean) => {
    const current = levels[zone.id];
    if (enabled) {
      if (current && current !== 'under_attack') {
        previousLevels.current[zone.id] = current;
      }
      showActionMenu({
        title: t('home.underAttackEnable'),
        message: t('home.underAttackEnableConfirm', { name: zone.name }),
        cancelLabel: t('common.cancel'),
        actions: [
          {
            label: t('home.underAttackEnable'),
            destructive: true,
            onPress: () => {
              void applyLevel(zone, 'under_attack');
            },
          },
        ],
      });
      return;
    }

    const restore = previousLevels.current[zone.id] ?? FALLBACK_LEVEL;
    void applyLevel(zone, restore);
  };

  const levelLabel = (value: ZoneSecurityLevel | null): string => {
    if (!isSecurityLevel(value)) {
      return t('home.underAttackUnknown');
    }
    if (value === 'under_attack') {
      return t('home.securityLevel.under_attack');
    }
    return t('home.underAttackLevel', {
      level: t(`home.securityLevel.${value}`),
    });
  };

  return (
    <ZoneSubpage
      backLabel={t('tabs.home')}
      error={error}
      loading={loading && !error}
      subtitle={t('home.underAttackSubtitle')}
      title={t('home.underAttackTitle')}
    >
      <Text style={[styles.hint, { color: label(mode, 0.5) }]}>
        {t('home.underAttackHint')}
      </Text>

      {zones.length === 0 && !loading ? (
        <Text style={[styles.empty, { color: label(mode, 0.45) }]}>
          {t('home.underAttackEmpty')}
        </Text>
      ) : (
        <Card>
          {zones.map((zone, index) => {
            const level = levels[zone.id] ?? null;
            return (
              <ToggleRow
                key={zone.id}
                Icon={Globe}
                color={
                  level === 'under_attack' ? accent.orange : accent.blue
                }
                disabled={pendingId === zone.id || level === null}
                label={zone.name}
                last={index === zones.length - 1}
                onValueChange={(enabled) => onToggle(zone, enabled)}
                sub={levelLabel(level)}
                testID={`under-attack-toggle-${zone.id}`}
                value={level === 'under_attack'}
              />
            );
          })}
        </Card>
      )}
    </ZoneSubpage>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
  },
});
