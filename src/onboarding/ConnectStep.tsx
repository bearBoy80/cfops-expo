import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowRight, Cloud, KeyRound } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { accent, hairline, label, tint } from '../theme/tokens';
import {
  OnboardingPrimaryButton,
  OnboardingStepDots,
} from './OnboardingControls';

const connectionNotice =
  'Cloudflare connections arrive in the next milestone. Skip for now to continue.';

export function ConnectStep({
  onBack,
  onSkip,
}: {
  onBack: () => void;
  onSkip: () => Promise<void>;
}): React.JSX.Element {
  const { mode, colors } = useTheme();
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skip = async () => {
    if (busy) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await onSkip();
    } catch {
      setError('Could not save onboarding progress. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const showNotice = () => {
    setError(null);
    setNoticeVisible(true);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={[styles.title, { color: colors.text }]}>
          Bind Cloudflare accounts
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.55) }]}>
          Authorize access to import the Cloudflare accounts you operate.
        </Text>
      </View>

      <View style={styles.connectionChoices} testID="connection-choices">
        <ConnectionChoice
          Icon={Cloud}
          accentColor={accent.orange}
          detail="OAuth · imports all your accounts"
          emphasized
          label="Authorize with Cloudflare"
          onPress={showNotice}
        />
        <ConnectionChoice
          Icon={KeyRound}
          accentColor={accent.blue}
          detail="Paste a scoped token instead"
          label="Use an API token"
          onPress={showNotice}
        />
        {noticeVisible ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.notice,
              {
                backgroundColor: tint(accent.orange, '18'),
                color: label(mode, 0.65),
              },
            ]}
          >
            {connectionNotice}
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <OnboardingStepDots step="connect" />
        <OnboardingPrimaryButton
          busy={busy}
          label="Skip for now"
          onPress={() => {
            void skip();
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={[styles.backText, { color: label(mode, 0.5) }]}>
            Back
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ConnectionChoice({
  Icon,
  accentColor,
  detail,
  emphasized = false,
  label: choiceLabel,
  onPress,
}: {
  Icon: typeof Cloud;
  accentColor: string;
  detail: string;
  emphasized?: boolean;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const { mode, colors } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      accessibilityLabel={choiceLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.connectionChoice,
        {
          backgroundColor: colors.surface,
          borderColor: emphasized
            ? tint(accent.orange, '66')
            : hairline(mode, 0.08),
        },
      ]}
    >
      <View
        style={[
          styles.connectionIcon,
          { backgroundColor: tint(accentColor, '26') },
        ]}
      >
        <Icon
          accessibilityElementsHidden
          color={accentColor}
          size={20}
        />
      </View>
      <View style={styles.connectionCopy}>
        <Text style={[styles.connectionLabel, { color: colors.text }]}>
          {choiceLabel}
        </Text>
        <Text style={[styles.connectionDetail, { color: label(mode, 0.45) }]}>
          {detail}
        </Text>
      </View>
      <ArrowRight
        accessibilityElementsHidden
        color={emphasized ? accent.orange : label(mode, 0.4)}
        size={18}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    minHeight: 44,
    paddingTop: 12,
  },
  backText: {
    fontSize: 14,
  },
  connectionChoice: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    width: '100%',
  },
  connectionChoices: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  connectionCopy: {
    flex: 1,
  },
  connectionDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  connectionIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  connectionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  error: {
    color: accent.red,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  footer: {
    paddingBottom: 20,
    paddingTop: 16,
  },
  notice: {
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  title: {
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
});
