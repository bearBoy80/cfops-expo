import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  ArrowRight,
  Building2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { createOnboardingAccount } from '../auth/localAccount';
import { useTheme } from '../theme/ThemeContext';
import { accent, label, tint } from '../theme/tokens';
import {
  OnboardingField,
  OnboardingPrimaryButton,
  OnboardingStepDots,
} from './OnboardingControls';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateAccountDraft {
  organization: string;
  name: string;
  email: string;
  password: string;
  confirm: string;
  biometricsEnabled: boolean;
}

export function CreateAccountStep({
  draft,
  onBack,
  onCreated,
  onDraftChange,
}: {
  draft: CreateAccountDraft;
  onBack: () => void;
  onCreated: () => void;
  onDraftChange: (update: Partial<CreateAccountDraft>) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    organization,
    name,
    email,
    password,
    confirm,
    biometricsEnabled,
  } = draft;

  const trimmedEmail = email.trim();
  const emailValid = emailPattern.test(trimmedEmail);
  const passwordValid = password.length >= 8;
  const confirmationValid = confirm === password;
  const complete =
    organization.trim().length > 0 &&
    name.trim().length > 0 &&
    trimmedEmail.length > 0 &&
    password.length > 0 &&
    confirm.length > 0;
  const formValid =
    complete && emailValid && passwordValid && confirmationValid;

  const submit = async () => {
    if (!formValid || busy) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await createOnboardingAccount(
        {
          organization: organization.trim(),
          name: name.trim(),
          email: trimmedEmail,
        },
        password,
        biometricsEnabled,
      );
      onCreated();
    } catch {
      setError(t('onboarding.create.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('onboarding.create.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.55) }]}>
          {t('onboarding.create.subtitle')}
        </Text>
      </View>

      <View style={styles.form}>
        <OnboardingField
          Icon={Building2}
          onChangeText={(value) => onDraftChange({ organization: value })}
          placeholder={t('onboarding.create.organizationPlaceholder')}
          testID="organization"
          value={organization}
        />
        <OnboardingField
          Icon={User}
          onChangeText={(value) => onDraftChange({ name: value })}
          placeholder={t('onboarding.create.namePlaceholder')}
          testID="name"
          value={name}
        />
        <View>
          <OnboardingField
            Icon={Mail}
            keyboardType="email-address"
            onChangeText={(value) => onDraftChange({ email: value })}
            placeholder={t('onboarding.create.emailPlaceholder')}
            testID="email"
            value={email}
          />
          {trimmedEmail.length > 0 && !emailValid ? (
            <Text accessibilityRole="alert" style={styles.validationError}>
              {t('onboarding.create.emailInvalid')}
            </Text>
          ) : null}
        </View>
        <View>
          <OnboardingField
            Icon={Lock}
            onChangeText={(value) => onDraftChange({ password: value })}
            placeholder={t('onboarding.create.passwordPlaceholder')}
            secureTextEntry
            testID="password"
            value={password}
          />
          {password.length > 0 && !passwordValid ? (
            <Text accessibilityRole="alert" style={styles.validationError}>
              {t('onboarding.create.passwordTooShort')}
            </Text>
          ) : null}
        </View>
        <View>
          <OnboardingField
            Icon={Lock}
            onChangeText={(value) => onDraftChange({ confirm: value })}
            placeholder={t('onboarding.create.confirmPlaceholder')}
            secureTextEntry
            testID="confirm"
            value={confirm}
          />
          {confirm.length > 0 && !confirmationValid ? (
            <Text accessibilityRole="alert" style={styles.validationError}>
              {t('onboarding.create.passwordMismatch')}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={[styles.preference, { backgroundColor: colors.surface }]}
      >
        <View style={styles.preferenceCopy}>
          <Text style={[styles.preferenceTitle, { color: colors.text }]}>
            {t('onboarding.create.biometricsTitle')}
          </Text>
          <Text
            style={[
              styles.preferenceSubtitle,
              { color: label(mode, 0.5) },
            ]}
          >
            {t('onboarding.create.biometricsSubtitle')}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t('onboarding.create.biometricsA11y')}
          disabled={busy}
          onValueChange={(value) =>
            onDraftChange({ biometricsEnabled: value })
          }
          thumbColor={
            biometricsEnabled ? accent.orange : label(mode, 0.7)
          }
          trackColor={{
            false: colors.surface2,
            true: tint(accent.orange, '88'),
          }}
          value={biometricsEnabled}
        />
      </View>

      <View style={styles.securityNote}>
        <ShieldCheck
          accessibilityElementsHidden
          color={accent.green}
          size={14}
        />
        <Text style={[styles.securityText, { color: label(mode, 0.45) }]}>
          {t('onboarding.create.securityNote')}
        </Text>
      </View>

      <View style={styles.spacer} />
      <View style={styles.footer}>
        {!formValid ? (
          <Text style={[styles.hint, { color: label(mode, 0.4) }]}>
            {t('onboarding.create.fillAll')}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.submitError}>
            {error}
          </Text>
        ) : null}
        <OnboardingStepDots step="create" />
        <OnboardingPrimaryButton
          Icon={ArrowRight}
          busy={busy}
          disabled={!formValid}
          label={t('onboarding.create.cta')}
          onPress={() => {
            void submit();
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

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    minHeight: 44,
    paddingTop: 12,
  },
  backText: {
    fontSize: 14,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  footer: {
    paddingBottom: 20,
    paddingTop: 4,
  },
  form: {
    gap: 12,
    marginTop: 24,
  },
  hint: {
    fontSize: 12,
    paddingBottom: 2,
    textAlign: 'center',
  },
  preference: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    marginTop: 16,
    padding: 14,
  },
  preferenceCopy: {
    flex: 1,
    paddingRight: 12,
  },
  preferenceSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  preferenceTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  securityNote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  spacer: {
    flex: 1,
    minHeight: 16,
  },
  submitError: {
    color: accent.red,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
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
  validationError: {
    color: accent.red,
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
});
