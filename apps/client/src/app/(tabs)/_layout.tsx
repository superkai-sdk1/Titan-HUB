import { Tabs } from 'expo-router/tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBar } from '@/components/tab-bar';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
          animation: 'shift',
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Кошелёк' }} />
        <Tabs.Screen name="history" options={{ title: 'История' }} />
        <Tabs.Screen name="inbox" options={{ title: 'Входящие' }} />
        <Tabs.Screen name="profile" options={{ title: 'Профиль' }} />
      </Tabs>
      {/* Строка состояния прозрачная (edge-to-edge): без подложки прокручиваемый
          контент уезжает под часы и значки. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 12,
          experimental_backgroundImage: 'linear-gradient(180deg, rgba(21,18,27,0.98) 0%, rgba(21,18,27,0.94) 72%, rgba(21,18,27,0) 100%)',
        }}
      />
    </View>
  );
}
