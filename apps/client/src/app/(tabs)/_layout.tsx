import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/tab-bar';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  return (
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
  );
}
