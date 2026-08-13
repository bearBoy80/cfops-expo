import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Activity,
  ArrowRight,
  Building2,
  Cloud,
  Layers,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { accent, foreground, label, tint } from '../theme/tokens';
import {
  OnboardingPrimaryButton,
  OnboardingStepDots,
} from './OnboardingControls';

const features = [
  { Icon: Building2, color: accent.orange, key: 'onboarding.welcome.feature1' },
  { Icon: Layers, color: accent.blue, key: 'onboarding.welcome.feature2' },
  { Icon: Activity, color: accent.green, key: 'onboarding.welcome.feature3' },
];

export function WelcomeStep({
  onContinue,
}: {
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.body}>
        <View
          style={[
            styles.heroIcon,
            {
              boxShadow: `0 20px 50px ${tint(accent.orange, '59')}`,
              experimental_backgroundImage: `linear-gradient(135deg, ${accent.orange}, ${accent.red})`,
            },
          ]}
        >
          <Cloud
            accessibilityElementsHidden
            color={foreground.onAccent}
            size={40}
            strokeWidth={2.2}
          />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          {t('onboarding.welcome.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.55) }]}>
          {t('onboarding.welcome.subtitle')}
        </Text>

        <View style={styles.features}>
          {features.map(({ Icon, color, key }) => (
            <View
              key={key}
              style={[styles.feature, { backgroundColor: colors.surface }]}
            >
              <View
                style={[
                  styles.featureIcon,
                  { backgroundColor: tint(color, '22') },
                ]}
              >
                <Icon
                  accessibilityElementsHidden
                  color={color}
                  size={18}
                />
              </View>
              <Text style={[styles.featureText, { color: colors.text }]}>
                {t(key)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <OnboardingStepDots step="welcome" />
        <OnboardingPrimaryButton
          Icon={ArrowRight}
          label={t('onboarding.welcome.cta')}
          onPress={onContinue}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  feature: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  featureIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    textAlign: 'left',
  },
  features: {
    gap: 12,
    marginTop: 32,
    width: '100%',
  },
  footer: {
    paddingBottom: 32,
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: 22,
    height: 80,
    justifyContent: 'center',
    marginBottom: 24,
    width: 80,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 36,
    textAlign: 'center',
  },
});
