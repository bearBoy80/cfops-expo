import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import {
  accent,
  foreground,
  hairline,
  label,
  tint,
} from '../theme/tokens';
import { onboardingSteps, type OnboardingStep } from './types';

export function OnboardingStepDots({
  step,
}: {
  step: OnboardingStep;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { mode } = useTheme();
  const activeIndex = onboardingSteps.indexOf(step);

  return (
    <View
      accessibilityLabel={t('onboarding.stepA11y', {
        current: activeIndex + 1,
        total: onboardingSteps.length,
      })}
      accessibilityRole="progressbar"
      accessibilityValue={{
        max: onboardingSteps.length,
        min: 1,
        now: activeIndex + 1,
      }}
      style={styles.dots}
    >
      {onboardingSteps.map((item, index) => (
        <View
          key={item}
          style={[
            styles.dot,
            index === activeIndex ? styles.activeDot : null,
            {
              backgroundColor:
                index <= activeIndex
                  ? accent.orange
                  : hairline(mode, 0.18),
            },
          ]}
        />
      ))}
    </View>
  );
}

export function OnboardingPrimaryButton({
  label: buttonLabel,
  onPress,
  disabled = false,
  busy = false,
  Icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  Icon?: LucideIcon;
}): React.JSX.Element {
  const unavailable = disabled || busy;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      accessibilityLabel={buttonLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={[
        styles.primaryButton,
        {
          backgroundColor: unavailable
            ? tint(accent.orange, '59')
            : accent.orange,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground.onAccent} size="small" />
      ) : null}
      <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
      {Icon && !busy ? (
        <Icon
          accessibilityElementsHidden
          color={foreground.onAccent}
          size={18}
        />
      ) : null}
    </TouchableOpacity>
  );
}

export function OnboardingField({
  Icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType,
  testID,
}: {
  Icon: LucideIcon;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  testID: string;
}): React.JSX.Element {
  const { mode, colors } = useTheme();

  return (
    <View style={[styles.field, { backgroundColor: colors.surface }]}>
      <Icon
        accessibilityElementsHidden
        color={label(mode, 0.5)}
        size={17}
      />
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize={
          keyboardType === 'email-address' || secureTextEntry
            ? 'none'
            : 'words'
        }
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={label(mode, 0.3)}
        secureTextEntry={secureTextEntry}
        selectionColor={accent.orange}
        style={[styles.fieldInput, { color: colors.text }]}
        testID={testID}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  activeDot: {
    width: 20,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  field: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
    width: '100%',
  },
  primaryButtonText: {
    color: foreground.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
});
