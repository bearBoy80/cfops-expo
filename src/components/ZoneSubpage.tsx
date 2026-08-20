import { useCallback, useState, type ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import {
  accent,
  font,
  hairline,
  label,
  maxScale,
  spacing,
} from '../theme/tokens';
import { Enter, ErrorState, ScreenSkeleton } from './ui';
import { haptics } from '../utils/haptics';
import { useTabBarInset, useTabBarOverlayOffset } from './useTabBarInset';

interface Props {
  title: string;
  subtitle?: string;
  /** Back button label, usually the zone name. */
  backLabel: string;
  loading?: boolean;
  error?: string | null;
  /** Optional action rendered on the title row, e.g. an add button. */
  headerRight?: ReactNode;
  /** Enables pull-to-refresh when provided. */
  onRefresh?: () => Promise<unknown> | void;
  /**
   * Toolbar pinned above the tab bar, for actions on a selection. Kept out of
   * the scroll view so it stays reachable in a long list instead of being
   * buried at the bottom of the content.
   */
  footer?: ReactNode;
  children?: ReactNode;
}

/** Shared scaffold for the zone service sub-pages (DNS, SSL, cache, ...). */
export function ZoneSubpage({
  title,
  subtitle,
  backLabel,
  loading = false,
  error = null,
  headerRight,
  onRefresh,
  footer,
  children,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useTabBarInset(32);
  const overlayOffset = useTabBarOverlayOffset();
  // Measured rather than assumed: the toolbar's height depends on its content,
  // and the last list row must not end up hidden behind it.
  const [footerHeight, setFooterHeight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    if (!onRefresh) {
      return;
    }
    haptics.tap();
    setRefreshing(true);
    void Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
  }, [onRefresh]);

  return (
    <View
      style={[
        styles.safeArea,
        { backgroundColor: colors.bg, paddingTop: insets.top },
      ]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomInset + footerHeight },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              onRefresh={refresh}
              refreshing={refreshing}
              tintColor={accent.orange}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <View style={styles.backButton}>
            <ChevronLeft color={accent.orange} size={22} />
            <Text
              maxFontSizeMultiplier={maxScale('headline')}
              numberOfLines={1}
              style={styles.backLabel}
            >
              {backLabel}
            </Text>
          </View>
        </Pressable>

        <View style={styles.titleRow}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={maxScale('largeTitle')}
            style={[styles.title, { color: colors.text }]}
          >
            {title}
          </Text>
          {headerRight}
        </View>
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={maxScale('body')}
            style={[styles.subtitle, { color: label(mode, 0.5) }]}
          >
            {subtitle}
          </Text>
        ) : null}

        {error ? (
          <ErrorState
            message={error}
            onRetry={onRefresh ? refresh : undefined}
            retryLabel={t('common.retry')}
          />
        ) : null}

        {loading && !error ? (
          <ScreenSkeleton testID="subpage-skeleton" />
        ) : (
          <Enter>{children}</Enter>
        )}
      </ScrollView>

      {footer ? (
        <View
          onLayout={(event) =>
            setFooterHeight(event.nativeEvent.layout.height)
          }
          style={[
            styles.footer,
            {
              backgroundColor: colors.tabbar,
              borderTopColor: hairline(mode, 0.16),
              bottom: overlayOffset,
              // The tab bar already covers the home indicator on iOS; without
              // one below it the toolbar has to clear it itself.
              paddingBottom: overlayOffset > 0 ? spacing.sm : insets.bottom,
            },
          ]}
          testID="subpage-footer"
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 2,
    marginTop: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingTop: 2,
  },
  backLabel: {
    ...font('headline', '400'),
    color: accent.orange,
    maxWidth: 260,
  },
  content: {},
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    left: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    ...font('body'),
    marginTop: 3,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...font('largeTitle'),
    flex: 1,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: 2,
  },
});
