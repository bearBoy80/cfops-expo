import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { accent, hairline, label } from '../theme/tokens';

interface AuthTextInputProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  testID?: string;
  textContentType?: TextInputProps['textContentType'];
}

export function AuthTextInput({
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  testID,
  textContentType,
}: AuthTextInputProps) {
  const { mode, colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      accessibilityLabel={placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      onBlur={() => setFocused(false)}
      onChangeText={onChangeText}
      onFocus={() => setFocused(true)}
      placeholder={placeholder}
      placeholderTextColor={label(mode, 0.35)}
      secureTextEntry={secureTextEntry}
      selectionColor={accent.orange}
      style={[
        styles.input,
        {
          backgroundColor: colors.searchBg,
          borderColor: focused ? accent.orange : hairline(mode, 0.08),
          color: colors.text,
        },
      ]}
      testID={testID}
      textContentType={textContentType}
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
});
