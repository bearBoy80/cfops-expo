import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import type { SymbolViewProps } from 'expo-symbols';
import {
  Activity,
  Database,
  Globe,
  Settings,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { accent, label, radius, tint } from '../../src/theme/tokens';
import { haptics } from '../../src/utils/haptics';

interface TabIconProps {
  focused: boolean;
  color: ColorValue;
  symbol: SymbolViewProps['name'];
  focusedSymbol?: SymbolViewProps['name'];
  Fallback: LucideIcon;
}

/** Icon wrapped in the design-reference capsule highlight when active. */
function TabIcon({ focused, color, symbol, focusedSymbol, Fallback }: TabIconProps) {
  return (
    <View style={styles.tabIconWrap}>
      {focused ? (
        <View
          style={[
            styles.tabIconCapsule,
            { backgroundColor: tint(accent.orange, '26') },
          ]}
        />
      ) : null}
      <Icon
        Fallback={Fallback}
        color={color}
        size={22}
        symbol={focused && focusedSymbol ? focusedSymbol : symbol}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const translucent = Platform.OS === 'ios';

  return (
    <Tabs
      screenListeners={{
        tabPress: () => haptics.selection(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent.orange,
        tabBarInactiveTintColor: label(mode, 0.5),
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: {
          borderTopColor: label(mode, 0.07),
          ...(translucent
            ? { position: 'absolute' as const, backgroundColor: 'transparent' }
            : { backgroundColor: colors.tabbar }),
        },
        tabBarBackground: translucent
          ? () => (
              <BlurView
                intensity={90}
                style={StyleSheet.absoluteFill}
                tint={
                  mode === 'dark'
                    ? 'systemChromeMaterialDark'
                    : 'systemChromeMaterialLight'
                }
              />
            )
          : undefined,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              Fallback={Activity}
              color={color}
              focused={focused}
              symbol="waveform.path.ecg"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="(zones)"
        options={{
          title: t('tabs.zones'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              Fallback={Globe}
              color={color}
              focused={focused}
              symbol="globe"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="(storage)"
        options={{
          title: t('tabs.storage'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              Fallback={Database}
              color={color}
              focused={focused}
              symbol="cylinder.split.1x2"
              focusedSymbol="cylinder.split.1x2.fill"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="(compute)"
        options={{
          title: t('tabs.compute'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              Fallback={Zap}
              color={color}
              focused={focused}
              symbol="bolt"
              focusedSymbol="bolt.fill"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="(settings)"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              Fallback={Settings}
              color={color}
              focused={focused}
              symbol="gearshape"
              focusedSymbol="gearshape.fill"
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconCapsule: {
    borderRadius: radius.full,
    // Inset vertically rather than filling the icon box: a capsule flush with
    // the box edge reads as touching the label underneath it.
    bottom: 2,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 2,
  },
  tabIconWrap: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 50,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    // Clears the capsule without growing the bar: the icon box keeps its
    // height, only the label shifts down.
    marginTop: 2,
  },
});
