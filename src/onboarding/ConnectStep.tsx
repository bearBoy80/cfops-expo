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
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { accent, hairline, label, tint } from '../theme/tokens';
import {
  OnboardingPrimaryButton,
  OnboardingStepDots,
} from './OnboardingControls';

export function ConnectStep({
  onBack,
  onSkip,
}: {
  onBack: () => void;
  onSkip: () => Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation();
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
      setError(t('onboarding.connect.saveFailed'));
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
          {t('onboarding.connect.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.55) }]}>
          {t('onboarding.connect.subtitle')}
        </Text>
      </View>

      <View style={styles.connectionChoices} testID="connection-choices">
        <ConnectionChoice
          Icon={Cloud}
          accentColor={accent.orange}
          detail={t('onboarding.connect.oauthDetail')}
          emphasized
          label={t('onboarding.connect.oauthLabel')}
          onPress={showNotice}
        />
        <ConnectionChoice
          Icon={KeyRound}
          accentColor={accent.blue}
          detail={t('onboarding.connect.tokenDetail')}
          label={t('onboarding.connect.tokenLabel')}
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
            {t('onboarding.connect.notice')}
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
          label={t('onboarding.connect.cta')}
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
            {t('common.back')}
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
