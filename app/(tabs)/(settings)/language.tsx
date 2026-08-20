import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  getStoredLanguage,
  setAppLanguage,
  type AppLanguage,
} from '@/src/i18n';
import { Card, ListRow } from '@/src/components/ui';
import { useTabBarInset } from '@/src/components/useTabBarInset';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, fontFace, label } from '@/src/theme/tokens';

const options: AppLanguage[] = ['system', 'en', 'zh-Hans'];

export default function LanguageScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const bottomInset = useTabBarInset();
  const [selected, setSelected] = useState<AppLanguage | null>(null);

  useEffect(() => {
    let active = true;
    void getStoredLanguage().then((preference) => {
      if (active) {
        setSelected(preference);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const choose = (preference: AppLanguage) => {
    setSelected(preference);
    void setAppLanguage(preference).catch(() => {
      // Persisting failed; the in-memory language is already applied.
    });
  };

  const optionLabel = (option: AppLanguage) =>
    option === 'system' ? t('language.system') : t(`language.${option}`);

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
          {t('language.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
          {t('language.subtitle')}
        </Text>

        <Card>
          {options.map((option, index) => (
            <ListRow
              key={option}
              chevron={false}
              last={index === options.length - 1}
              onPress={() => choose(option)}
              left={
                <View
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selected === option }}
                  style={styles.optionRow}
                  testID={`language-${option}`}
                >
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionLabel, { color: colors.text }]}>
                      {optionLabel(option)}
                    </Text>
                    {option === 'system' ? (
                      <Text
                        style={[styles.optionSub, { color: label(mode, 0.4) }]}
                      >
                        {t('language.systemDetail')}
                      </Text>
                    ) : null}
                  </View>
                  {selected === option ? (
                    <Check color={accent.orange} size={18} strokeWidth={2.4} />
                  ) : null}
                </View>
              }
            />
          ))}
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
  content: {},
  optionCopy: {
    flex: 1,
  },
  optionLabel: {
    ...fontFace('body', '500'),
  },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  optionSub: {
    ...fontFace('footnote'),
    marginTop: 1,
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    ...fontFace('subhead'),
    marginBottom: 12,
    marginTop: 2,
    paddingHorizontal: 16,
  },
  title: {
    ...fontFace('largeTitle'),
    paddingHorizontal: 16,
    paddingTop: 4,
  },
});
