import { Tabs } from 'expo-router';
import {
  Activity,
  Database,
  Globe,
  Settings,
  Zap,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, label } from '@/src/theme/tokens';

export default function TabsLayout() {
  const { t } = useTranslation();
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
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Activity color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(zones)"
        options={{
          title: t('tabs.zones'),
          tabBarIcon: ({ color, size }) => <Globe color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="(storage)"
        options={{
          title: t('tabs.storage'),
          tabBarIcon: ({ color, size }) => (
            <Database color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(compute)"
        options={{
          title: t('tabs.compute'),
          tabBarIcon: ({ color, size }) => <Zap color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="(settings)"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <Settings color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
