import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { accent, hairline, label } from '../theme/tokens';

interface AuthTextInputProps {
  disabled?: boolean;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  placeholder: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  testID?: string;
  textContentType?: TextInputProps['textContentType'];
}

export function AuthTextInput({
  disabled,
  onSubmitEditing,
  placeholder,
  returnKeyType,
  value,
  onChangeText,
  secureTextEntry,
  showPasswordToggle,
  testID,
  textContentType,
}: AuthTextInputProps) {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isSecure = Boolean(secureTextEntry && !passwordVisible);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.searchBg,
          borderColor: focused ? accent.orange : hairline(mode, 0.08),
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={label(mode, 0.35)}
        returnKeyType={returnKeyType}
        secureTextEntry={isSecure}
        selectionColor={accent.orange}
        style={[styles.input, { color: colors.text }]}
        testID={testID}
        textContentType={textContentType}
        value={value}
      />
      {showPasswordToggle ? (
        <Pressable
          accessibilityLabel={
            passwordVisible
              ? t('authInput.hidePassword')
              : t('authInput.showPassword')
          }
          accessibilityRole="button"
          disabled={disabled}
          hitSlop={10}
          onPress={() => setPasswordVisible((visible) => !visible)}
          style={styles.visibilityButton}
        >
          {passwordVisible ? (
            <EyeOff color={label(mode, 0.55)} size={19} />
          ) : (
            <Eye color={label(mode, 0.55)} size={19} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  visibilityButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
