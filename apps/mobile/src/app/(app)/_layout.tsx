import { usePathname, useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';

import { CheckAccessory } from '@/components/check-accessory';
import { ShiftAccessory } from '@/components/shift-accessory';
import { useChrome } from '@/lib/chrome';
import { haptic } from '@/lib/haptics';
import { colors, space } from '@/lib/theme';

const IS_PAD = Platform.OS === 'ios' && Platform.isPad;
/** Высота таб-бара Material — под ней и живёт плашка на Android. */
const TAB_BAR_HEIGHT = 64;
const CHECK_PATH = /^\/pos\/([0-9a-f-]{36})$/i;

/**
 * «Новый» всегда в акценте. Иконка — системный символ, поэтому iOS выравнивает её
 * ровно как соседние; цвет задаём внешним видом самой вкладки во всех состояниях.
 */
const accentItem = { tabBarItemIconColor: colors.accent, tabBarItemTitleFontColor: colors.accent };
const accentStates = { normal: accentItem, selected: accentItem, focused: accentItem, disabled: accentItem };
const accentAppearance = { stacked: accentStates, inline: accentStates, compactInline: accentStates };
const newTabNativeProps = {
  ios: {
    standardAppearance: accentAppearance,
    scrollEdgeAppearance: { ...accentAppearance, tabBarBlurEffect: 'none' as const, tabBarShadowColor: 'transparent' },
  },
};

/**
 * Системный таб-бар (UITabBarController): Liquid Glass на iOS 26, на iPad — боковая панель.
 *
 * «Новый» на iPhone — кнопка, а не экран: вкладка `disabled` (выбрать нельзя, но нажатие
 * приходит событием) открывает шторку создания чека. На iPad вкладки нет: кнопка
 * «Новый чек» живёт в плашке смены.
 *
 * Над таб-баром — системная плашка (bottom accessory): на главном экране кассы это смена
 * (на iPhone прячется при прокрутке), в открытом чеке на iPhone — «Добавить» и «Оплатить».
 */
export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const accessoryVisible = useChrome((s) => s.accessoryVisible);
  const insets = useSafeAreaInsets();
  const openCheckId = IS_PAD ? undefined : CHECK_PATH.exec(pathname)?.[1];

  let accessory: React.ReactNode = null;
  if (pathname === '/pos' && (IS_PAD || accessoryVisible)) accessory = <ShiftAccessory />;
  else if (openCheckId) accessory = <CheckAccessory checkId={openCheckId} />;

  return (
    <View style={styles.root}>
    <NativeTabs
      tintColor={colors.accent}
      sidebarAdaptable
      screenListeners={({ route }) => ({
        tabPress: () => {
          // Папка без _layout даёт маршрут «new/index»: Trigger сопоставляет имя без «/index», а route.name — нет.
          if (route.name.replace(/\/index$/, '') === 'new') {
            haptic.light();
            router.push('/new-check');
          }
        },
      })}>
      <NativeTabs.Trigger name="pos">
        <NativeTabs.Trigger.Icon sf={{ default: 'rublesign.circle', selected: 'rublesign.circle.fill' }} md="currency_ruble" />
        <NativeTabs.Trigger.Label>Касса</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>События</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="new" disabled hidden={IS_PAD} unstable_nativeProps={newTabNativeProps}>
        <NativeTabs.Trigger.Icon sf="plus.circle.fill" md="add_circle" />
        <NativeTabs.Trigger.Label>Новый</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="analytics">
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} md="bar_chart" />
        <NativeTabs.Trigger.Label>Аналитика</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="manage">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
        <NativeTabs.Trigger.Label>Управление</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* BottomAccessory — фича iOS 26; на Android react-native-screens её не рисует. */}
      {accessory && Platform.OS === 'ios' && (
        <NativeTabs.BottomAccessory>{accessory}</NativeTabs.BottomAccessory>
      )}
    </NativeTabs>
    {/* На Android BottomAccessory не рисуется — кладём плашку своим слоем над таб-баром.
        Её android-вариант не вызывает usePlacement, который жив только внутри той фичи. */}
    {accessory && Platform.OS === 'android' && (
      <View pointerEvents="box-none" style={[styles.accessory, { bottom: insets.bottom + TAB_BAR_HEIGHT }]}>
        {accessory}
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  accessory: { position: 'absolute', left: space.md, right: space.md },
});
