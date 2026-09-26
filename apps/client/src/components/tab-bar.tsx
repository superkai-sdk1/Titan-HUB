// Панель вкладок: плавающая тёмная капсула (одинаковая на iOS и Android), выбранная
// вкладка подсвечена «таблеткой», которая переезжает пружиной. В центре — круглая
// кнопка «Оплатить»: пополнение депозита, долг, взносы — главное действие клиента.
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { useWallet } from '@/lib/queries';
import { colors, springs, violetGradient } from '@/lib/theme';

import { Icon, type IconName, Tap } from './ui';

export const TAB_BAR_HEIGHT = 64;
const PAD = 6;

/** Нижний отступ контента, чтобы последняя строка не пряталась под панелью. */
export function useTabClearance(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 20;
}

type Slot = { key: string; label: string; icon: IconName; iconActive: IconName } | { key: 'pay'; action: true };

const SLOTS: Slot[] = [
  { key: 'index', label: 'Кошелёк', icon: 'wallet-outline', iconActive: 'wallet' },
  { key: 'history', label: 'История', icon: 'time-outline', iconActive: 'time' },
  { key: 'pay', action: true },
  { key: 'inbox', label: 'Входящие', icon: 'notifications-outline', iconActive: 'notifications' },
  { key: 'profile', label: 'Профиль', icon: 'person-outline', iconActive: 'person' },
];

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: wallet } = useWallet();
  const unread = wallet?.unreadNotifications ?? 0;
  const [width, setWidth] = useState(0);

  const focusedName = state.routes[state.index]?.name ?? 'index';
  const slotIndex = Math.max(0, SLOTS.findIndex((s) => s.key === focusedName));
  const slotWidth = width > 0 ? (width - PAD * 2) / SLOTS.length : 0;

  const x = useSharedValue(0);
  useEffect(() => {
    if (slotWidth > 0) x.set(withSpring(PAD + slotIndex * slotWidth, springs.snappy));
  }, [slotIndex, slotWidth, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {slotWidth > 0 ? <Animated.View style={[styles.pill, { width: slotWidth }, pill]} /> : null}
        {SLOTS.map((slot) => {
          if ('action' in slot) {
            return (
              <View key="pay" style={styles.slot}>
                <Tap
                  onPress={() => router.push('/pay')}
                  scaleTo={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Оплатить"
                  style={styles.payButton}
                >
                  <Icon name="add" size={30} color="#fff" />
                </Tap>
              </View>
            );
          }
          const route = state.routes.find((r) => r.name === slot.key);
          const focused = focusedName === slot.key;
          const onPress = () => {
            if (!route) return;
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              haptic.select();
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={slot.key}
              onPress={onPress}
              style={styles.slot}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={slot.key === 'inbox' && unread ? `${slot.label}, непрочитанных: ${unread}` : slot.label}
            >
              <View>
                <Icon name={focused ? slot.iconActive : slot.icon} size={23} color={focused ? colors.lavender : colors.textSecondary} />
                {slot.key === 'inbox' && unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, focused && { color: colors.lavender, fontWeight: '700' }]}>{slot.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 14 },
  bar: {
    width: '100%', maxWidth: 520, height: TAB_BAR_HEIGHT, borderRadius: 26,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD,
    backgroundColor: 'rgba(29,26,36,0.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  },
  pill: {
    position: 'absolute', left: 0, top: PAD, bottom: PAD, borderRadius: 20,
    backgroundColor: 'rgba(139,92,246,0.16)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
  },
  slot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary },
  payButton: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    experimental_backgroundImage: violetGradient,
    boxShadow: '0 8px 22px rgba(109,40,217,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  badge: {
    position: 'absolute', top: -4, right: -9, minWidth: 17, height: 17, borderRadius: 9,
    paddingHorizontal: 4, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.surface,
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
});
