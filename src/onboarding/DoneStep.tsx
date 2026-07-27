import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check, Sparkles } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { accent, label, tint } from '../theme/tokens';
import {
  OnboardingPrimaryButton,
  OnboardingStepDots,
} from './OnboardingControls';

export function DoneStep({
  onEnterConsole,
}: {
  onEnterConsole: () => Promise<void>;
}): React.JSX.Element {
  const { mode, colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterConsole = async () => {
    if (busy) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await onEnterConsole();
    } catch {
      setError('Could not finish setup. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.body}>
        <View
          style={[
            styles.doneIcon,
            { backgroundColor: tint(accent.green, '26') },
          ]}
        >
          <Check
            accessibilityElementsHidden
            color={accent.green}
            size={44}
            strokeWidth={2.6}
          />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          You&apos;re all set
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.55) }]}>
          Your console is ready. Bind your first Cloudflare account anytime
          from More → Connected Accounts.
        </Text>
        <View style={styles.tagline}>
          <Sparkles
            accessibilityElementsHidden
            color={accent.orange}
            size={15}
          />
          <Text style={[styles.taglineText, { color: label(mode, 0.5) }]}>
            Managing everything from one place
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <OnboardingStepDots step="done" />
        <OnboardingPrimaryButton
          Icon={ArrowRight}
          busy={busy}
          label="Enter Console"
          onPress={() => {
            void enterConsole();
          }}
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
  doneIcon: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: 24,
    width: 80,
  },
  error: {
    color: accent.red,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  footer: {
    paddingBottom: 32,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
    textAlign: 'center',
  },
  tagline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
  },
  taglineText: {
    fontSize: 13,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
});
