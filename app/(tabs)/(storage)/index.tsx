import { Database } from 'lucide-react-native';
import { View } from 'react-native';
import { EmptyState } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/ThemeContext';

export default function Storage() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <EmptyState
        Icon={Database}
        title="Storage"
        subtitle="Coming in a later milestone."
      />
    </View>
  );
}
