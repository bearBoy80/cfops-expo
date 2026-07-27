import { Activity } from 'lucide-react-native';
import { View } from 'react-native';
import { EmptyState } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/ThemeContext';

export default function Home() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <EmptyState
        Icon={Activity}
        title="Home"
        subtitle="Coming in a later milestone."
      />
    </View>
  );
}
