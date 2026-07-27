import { Zap } from 'lucide-react-native';
import { View } from 'react-native';
import { EmptyState } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/ThemeContext';

export default function Compute() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <EmptyState
        Icon={Zap}
        title="Compute"
        subtitle="Coming in a later milestone."
      />
    </View>
  );
}
