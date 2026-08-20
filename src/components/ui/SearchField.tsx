import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, label } from '../../theme/tokens';

/** Inline list filter styled like the zones tab search box. */
export function SearchField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  testID,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { mode, colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.searchBg }]}>
      <Search color={label(mode, 0.5)} size={16} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={label(mode, 0.35)}
        selectionColor={accent.orange}
        style={[styles.input, { color: colors.text }]}
        testID={testID}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 8,
  },
});
