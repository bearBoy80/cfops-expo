import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowRight, Cloud, KeyRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useConnectAccount } from '../cloudflare/useConnectAccount';
import { AuthTextInput } from '../components/AuthTextInput';
import { useTheme } from '../theme/ThemeContext';
import { accent, hairline, label, tint } from '../theme/tokens';
import {
  OnboardingPrimaryButton,
  OnboardingStepDots,
} from './OnboardingControls';

export function ConnectStep({
  onAdvance,
  onBack,
}: {
  onAdvance: () => Promise<void>;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const [tokenVisible, setTokenVisible] = useState(false);
  const [token, setToken] = useState('');
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);
  const {
    busy,
    canStartOauth,
    clearError,
    connectWithOauth,
    connectWithToken,
    error,
    oauthConfigured,
  } = useConnectAccount(() => {
    // Reports its own failure: the credential is already stored at this point,
    // so a write error here must not look like the binding itself failed.
    void runAdvance();
  });

  const locked = busy !== null || skipping;
  const canSubmitToken = token.trim().length > 0 && !locked;

  const runAdvance = async () => {
    setSkipError(null);
    setSkipping(true);
    try {
      await onAdvance();
    } catch {
      setSkipError(t('onboarding.connect.saveFailed'));
    } finally {
      setSkipping(false);
    }
  };

  const advance = () => {
    if (locked) {
      return;
    }
    void runAdvance();
  };

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
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
          busy={busy === 'oauth'}
          detail={t('onboarding.connect.oauthDetail')}
          disabled={!canStartOauth || locked}
          emphasized
          label={t('onboarding.connect.oauthLabel')}
          onPress={() => void connectWithOauth()}
        />
        {!oauthConfigured ? (
          <Text style={[styles.hint, { color: label(mode, 0.45) }]}>
            {t('connect.oauthNotConfigured')}
          </Text>
        ) : null}

        <ConnectionChoice
          Icon={KeyRound}
          accentColor={accent.blue}
          detail={t('onboarding.connect.tokenDetail')}
          disabled={locked}
          label={t('onboarding.connect.tokenLabel')}
          onPress={() => setTokenVisible((current) => !current)}
        />

        {tokenVisible ? (
          <View style={styles.tokenPanel} testID="token-panel">
            <AuthTextInput
              disabled={locked}
              onChangeText={(value) => {
                setToken(value);
                if (error) {
                  clearError();
                }
              }}
              onSubmitEditing={() => void connectWithToken(token)}
              placeholder={t('connect.tokenPlaceholder')}
              returnKeyType="go"
              secureTextEntry
              showPasswordToggle
              testID="api-token"
              value={token}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{
                busy: busy === 'token',
                disabled: !canSubmitToken,
              }}
              activeOpacity={0.8}
              disabled={!canSubmitToken}
              onPress={() => void connectWithToken(token)}
              style={[
                styles.tokenSubmit,
                {
                  backgroundColor: colors.surface,
                  opacity: canSubmitToken ? 1 : 0.5,
                },
              ]}
              testID="connect-submit"
            >
              {busy === 'token' ? (
                <ActivityIndicator color={accent.orange} size="small" />
              ) : (
                <Text style={styles.tokenSubmitText}>
                  {t('connect.submit')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        {skipError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {skipError}
          </Text>
        ) : null}
        <OnboardingStepDots step="connect" />
        <OnboardingPrimaryButton
          busy={skipping}
          disabled={busy !== null}
          label={t('onboarding.connect.cta')}
          onPress={advance}
        />
        <Pressable
          accessibilityRole="button"
          disabled={locked}
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
  busy = false,
  detail,
  disabled = false,
  emphasized = false,
  label: choiceLabel,
  onPress,
}: {
  Icon: typeof Cloud;
  accentColor: string;
  busy?: boolean;
  detail: string;
  disabled?: boolean;
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
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.connectionChoice,
        {
          backgroundColor: colors.surface,
          borderColor: emphasized
            ? tint(accent.orange, '66')
            : hairline(mode, 0.08),
          opacity: disabled ? 0.5 : 1,
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
      {busy ? (
        <ActivityIndicator color={accentColor} size="small" />
      ) : (
        <ArrowRight
          accessibilityElementsHidden
          color={emphasized ? accent.orange : label(mode, 0.4)}
          size={18}
        />
      )}
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
  hint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4,
    paddingHorizontal: 4,
  },
  scroll: {
    flex: 1,
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
  tokenPanel: {
    gap: 12,
  },
  tokenSubmit: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 50,
  },
  tokenSubmitText: {
    color: accent.orange,
    fontSize: 16,
    fontWeight: '600',
  },
});
