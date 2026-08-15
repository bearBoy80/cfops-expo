import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Globe, Search } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  fetchZonesSnapshot,
  type ZoneListItem,
  type ZonesSnapshot,
} from '@/src/cloudflare/resources';
import {
  AccountChip,
  Card,
  EmptyState,
  ListRow,
  Pill,
  zonePillStatus,
} from '@/src/components/ui';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label } from '@/src/theme/tokens';

const chipColors = [accent.orange, accent.blue, accent.purple, accent.green];

export default function Zones() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const [snapshot, setSnapshot] = useState<ZonesSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback((force: boolean) => {
    return fetchZonesSnapshot({ force })
      .then(setSnapshot)
      .catch(() => {
        // Keep the previous list when a refresh fails outright.
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const refresh = () => {
    setRefreshing(true);
    void load(true).finally(() => setRefreshing(false));
  };

  const accountColor = useMemo(() => {
    const map = new Map<string, string>();
    snapshot?.accounts.forEach((account, index) => {
      map.set(account.id, chipColors[index % chipColors.length]);
    });
    return map;
  }, [snapshot]);

  const visible = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return snapshot.zones;
    }
    return snapshot.zones.filter(
      (zone) =>
        zone.name.toLowerCase().includes(needle) ||
        zone.accountName.toLowerCase().includes(needle),
    );
  }, [snapshot, query]);

  const openZone = (zone: ZoneListItem) => {
    router.push({
      pathname: '/(tabs)/(zones)/[zoneId]',
      params: {
        zoneId: zone.id,
        connectionId: zone.connectionId,
        name: zone.name,
      },
    });
  };

  if (!snapshot) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {t('zones.title')}
        </Text>
        <View style={styles.loading}>
          <ActivityIndicator color={accent.orange} />
        </View>
      </SafeAreaView>
    );
  }

  if (snapshot.connectionCount === 0 || snapshot.zones.length === 0) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {t('zones.title')}
        </Text>
        <EmptyState
          Icon={Globe}
          title={t('zones.emptyTitle')}
          subtitle={
            snapshot.connectionCount === 0
              ? t('zones.emptyConnect')
              : t('zones.emptyNoZones')
          }
          actionLabel={
            snapshot.connectionCount === 0
              ? t('common.connectAccount')
              : undefined
          }
          onAction={
            snapshot.connectionCount === 0
              ? () => router.push('/connect')
              : undefined
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={refreshing}
            tintColor={accent.orange}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {t('zones.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
          {t('common.zoneCount', { count: snapshot.zones.length })} ·{' '}
          {t('common.accountCount', { count: snapshot.accounts.length })}
        </Text>

        <View
          style={[styles.searchBox, { backgroundColor: colors.searchBg }]}
        >
          <Search color={label(mode, 0.5)} size={16} />
          <TextInput
            accessibilityLabel={t('zones.searchA11y')}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder={t('zones.searchPlaceholder')}
            placeholderTextColor={label(mode, 0.35)}
            selectionColor={accent.orange}
            style={[styles.searchInput, { color: colors.text }]}
            testID="zone-search"
            value={query}
          />
        </View>

        {visible.length === 0 ? (
          <Text style={[styles.noResults, { color: label(mode, 0.45) }]}>
            {t('zones.noMatch', { query: query.trim() })}
          </Text>
        ) : (
          <Card>
            {visible.map((zone, index) => (
              <ListRow
                key={zone.id}
                last={index === visible.length - 1}
                onPress={() => openZone(zone)}
                left={
                  <View style={styles.zoneRow}>
                    <AccountChip
                      color={accountColor.get(zone.accountId) ?? accent.gray}
                      name={zone.accountName || zone.name}
                      size={26}
                    />
                    <View style={styles.zoneCopy}>
                      <View style={styles.zoneTitle}>
                        <Text
                          numberOfLines={1}
                          style={[styles.zoneName, { color: colors.text }]}
                        >
                          {zone.name}
                        </Text>
                        <Pill status={zonePillStatus(zone)} />
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[styles.zoneSub, { color: label(mode, 0.4) }]}
                      >
                        {zone.plan}
                        {zone.accountName ? ` · ${zone.accountName}` : ''}
                      </Text>
                    </View>
                  </View>
                }
              />
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  noResults: {
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  safeArea: {
    flex: 1,
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    marginHorizontal: 16,
    marginTop: 14,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 8,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 3,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  zoneCopy: {
    flex: 1,
    minWidth: 0,
  },
  zoneName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  zoneRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  zoneSub: {
    fontSize: 13,
    marginTop: 2,
  },
  zoneTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 1,
  },
});
