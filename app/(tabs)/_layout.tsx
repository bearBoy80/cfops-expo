import { Tabs } from 'expo-router';
import {
  Activity,
  Database,
  Globe,
  MoreHorizontal,
  Zap,
} from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeContext';
import { accent, label } from '../../src/theme/tokens';

export default function TabsLayout() {
  const { mode, colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent.orange,
        tabBarInactiveTintColor: label(mode, 0.5),
        tabBarStyle: {
          backgroundColor: colors.tabbar,
          borderTopColor: label(mode, 0.07),
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Activity color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(zones)"
        options={{
          title: 'Zones',
          tabBarIcon: ({ color, size }) => <Globe color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="(storage)"
        options={{
          title: 'Storage',
          tabBarIcon: ({ color, size }) => (
            <Database color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(compute)"
        options={{
          title: 'Compute',
          tabBarIcon: ({ color, size }) => <Zap color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="(more)"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <MoreHorizontal color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
