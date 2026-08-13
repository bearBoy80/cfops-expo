import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { accent, label } from '../theme/tokens';

interface Props {
  title: string;
  subtitle?: string;
  /** Back button label, usually the zone name. */
  backLabel: string;
  loading?: boolean;
  error?: string | null;
  /** Optional action rendered on the title row, e.g. an add button. */
  headerRight?: ReactNode;
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
  children,
}: Props) {
  const router = useRouter();
  const { mode, colors } = useTheme();

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft color={accent.orange} size={22} />
          <Text numberOfLines={1} style={styles.backLabel}>
            {backLabel}
          </Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {headerRight}
        </View>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
            {subtitle}
          </Text>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {loading && !error ? (
          <View style={styles.loading}>
            <ActivityIndicator color={accent.orange} />
          </View>
        ) : (
          children
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingTop: 2,
  },
  backLabel: {
    color: accent.orange,
    fontSize: 17,
    maxWidth: 260,
  },
  content: {
    paddingBottom: 32,
  },
  error: {
    color: accent.red,
    fontSize: 15,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  loading: {
    marginTop: 48,
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 3,
    paddingHorizontal: 16,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 2,
  },
});
