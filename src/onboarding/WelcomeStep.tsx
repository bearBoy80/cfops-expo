import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Activity,
  ArrowRight,
  Building2,
  Cloud,
  Layers,
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { accent, foreground, label, tint } from '../theme/tokens';
import {
  OnboardingPrimaryButton,
  OnboardingStepDots,
} from './OnboardingControls';

const features = [
  {
    Icon: Building2,
    color: accent.orange,
    text: "Create your team's console account",
  },
  {
    Icon: Layers,
    color: accent.blue,
    text: 'Bind multiple Cloudflare accounts',
  },
  {
    Icon: Activity,
    color: accent.green,
    text: 'Monitor & manage everything globally',
  },
];

export function WelcomeStep({
  onContinue,
}: {
  onContinue: () => void;
}): React.JSX.Element {
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
          Cloudflare Console
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.55) }]}>
          One place to manage every Cloudflare account you operate — zones,
          Workers, storage and security, all in a single global view.
        </Text>

        <View style={styles.features}>
          {features.map(({ Icon, color, text }) => (
            <View
              key={text}
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
                {text}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <OnboardingStepDots step="welcome" />
        <OnboardingPrimaryButton
          Icon={ArrowRight}
          label="Get Started"
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
