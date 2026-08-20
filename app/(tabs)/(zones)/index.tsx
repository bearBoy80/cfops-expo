import { useCallback, useMemo, useState } from 'react';
import {
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
  useToast,
  AccountChip,
  Card,
  EmptyState,
  ListRow,
  Pill,
  ScopeBanner,
  zonePillStatus,
  ScreenSkeleton,
} from '@/src/components/ui';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CollapsibleTitleContainer, CompactHeader, useCollapsibleTitle } from '@/src/components/CollapsibleTitle';
import { useTabBarInset } from '@/src/components/useTabBarInset';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAccountScope } from '@/src/state/accountScope';
import { haptics } from '@/src/utils/haptics';
import { showResourceMenu } from '@/src/utils/resourceMenu';
import { accent, fontFace, label } from '@/src/theme/tokens';

const chipColors = [accent.orange, accent.blue, accent.purple, accent.green];

export default function Zones() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const bottomInset = useTabBarInset();
  const { scrollY, onScroll } = useCollapsibleTitle();
  const { showToast } = useToast();
  const { scope } = useAccountScope();
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
    haptics.tap();
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

  const scopedAccount = useMemo(
    () => snapshot?.accounts.find((account) => account.id === scope) ?? null,
    [snapshot, scope],
  );

  const visible = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const scoped = scope
      ? snapshot.zones.filter((zone) => zone.accountId === scope)
      : snapshot.zones;
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return scoped;
    }
    return scoped.filter(
      (zone) =>
        zone.name.toLowerCase().includes(needle) ||
        zone.accountName.toLowerCase().includes(needle),
    );
  }, [snapshot, query, scope]);

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
        <ScreenSkeleton testID="screen-skeleton" />
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
      <CollapsibleTitleContainer>
      <CompactHeader scrollY={scrollY} title={t('zones.title')} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        entering={FadeInDown.duration(260)}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
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
          {scopedAccount
            ? t('common.zoneCount', {
                count: snapshot.zones.filter(
                  (zone) => zone.accountId === scope,
                ).length,
              })
            : `${t('common.zoneCount', { count: snapshot.zones.length })} · ${t('common.accountCount', { count: snapshot.accounts.length })}`}
        </Text>
        <ScopeBanner name={scopedAccount?.name ?? null} />

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
                onLongPress={() =>
                  showResourceMenu({
                    title: zone.name,
                    copyLabel: t('common.copyId'),
                    copyValue: zone.id,
                    dashboardPath: `${zone.accountId}/${zone.name}`,
                    t,
                    onCopied: () => showToast(t('common.copied')),
                  })
                }
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
      </Animated.ScrollView>
      </CollapsibleTitleContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {},
  noResults: {
    ...fontFace('body'),
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
    ...fontFace('headline', '400'),
    flex: 1,
    paddingVertical: 8,
  },
  subtitle: {
    ...fontFace('body'),
    marginTop: 3,
    paddingHorizontal: 16,
  },
  title: {
    ...fontFace('display'),
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  zoneCopy: {
    flex: 1,
    minWidth: 0,
  },
  zoneName: {
    ...fontFace('bodyLarge', '500'),
    flexShrink: 1,
  },
  zoneRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  zoneSub: {
    ...fontFace('subhead'),
    marginTop: 2,
  },
  zoneTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 1,
  },
});
