import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Card } from '@/src/components/ui';
import { useTabBarInset } from '@/src/components/useTabBarInset';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, label } from '@/src/theme/tokens';

interface LegalSection {
  heading: string;
  body: string;
}

/**
 * Renders a static legal document (privacy policy, terms of service) entirely
 * in-app from i18n content, so nothing links out to an external browser.
 */
export function LegalScreen({ namespace }: { namespace: 'privacy' | 'terms' }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const bottomInset = useTabBarInset();

  const sections = t(`${namespace}.sections`, {
    returnObjects: true,
  }) as LegalSection[];

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft color={accent.orange} size={18} />
          <Text style={styles.backLabel}>{t('tabs.settings')}</Text>
        </Pressable>

        <Text style={[styles.title, { color: colors.text }]}>
          {t(`${namespace}.title`)}
        </Text>
        <Text style={[styles.updated, { color: label(mode, 0.4) }]}>
          {t(`${namespace}.updated`)}
        </Text>

        <Text style={[styles.intro, { color: label(mode, 0.6) }]}>
          {t(`${namespace}.intro`)}
        </Text>

        <Card>
          <View style={styles.body}>
            {sections.map((section, index) => (
              <Fragment key={section.heading}>
                <Text
                  style={[
                    styles.heading,
                    { color: colors.text },
                    index === 0 && styles.headingFirst,
                  ]}
                >
                  {section.heading}
                </Text>
                <Text style={[styles.paragraph, { color: label(mode, 0.6) }]}>
                  {section.body}
                </Text>
              </Fragment>
            ))}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  backLabel: {
    ...fontFace('headline', '400'),
    color: accent.orange,
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  content: {},
  heading: {
    ...fontFace('headline', '600'),
    marginTop: 18,
  },
  headingFirst: {
    marginTop: 12,
  },
  intro: {
    ...fontFace('subhead'),
    marginBottom: 16,
    marginTop: 2,
    paddingHorizontal: 16,
  },
  paragraph: {
    ...fontFace('body'),
    marginBottom: 4,
    marginTop: 6,
  },
  safeArea: {
    flex: 1,
  },
  title: {
    ...fontFace('largeTitle'),
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  updated: {
    ...fontFace('footnote'),
    marginTop: 4,
    paddingHorizontal: 16,
  },
});
