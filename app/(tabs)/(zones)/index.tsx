import { Globe } from 'lucide-react-native';
import { View } from 'react-native';
import { EmptyState } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/ThemeContext';

export default function Zones() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <EmptyState
        Icon={Globe}
        title="Zones"
        subtitle="Coming in a later milestone."
      />
    </View>
  );
}
