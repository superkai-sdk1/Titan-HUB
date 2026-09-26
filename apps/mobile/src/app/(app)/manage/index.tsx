import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppRefreshControl } from '@/components/refresh-control';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Avatar, GlassCard } from '@/components/new-check-parts';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { visibleManageGroups, type ManageSection, type ManageSectionKey } from '@/lib/manage-sections';
import { signOutEverywhere, useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

const ROLE_LABEL: Record<string, string> = { owner: 'Владелец', staff: 'Сотрудник' };

/** Системные цвета значков разделов — как цветные квадраты в «Настройках» iOS. */
const ICON_COLORS: Record<ManageSection['color'], ColorValue> = {
  red: colors.red,
  orange: colors.orange,
  yellow: colors.yellow,
  green: colors.green,
  blue: colors.blue,
  purple: colors.purple,
  pink: colors.pink,
  gray: colors.gray,
  mint: colors.mint,
  teal: colors.teal,
  cyan: colors.cyan,
  indigo: colors.indigo,
  brown: colors.brown,
};

/** Экран каждого раздела «Управления». */
const SECTION_SCREENS: Record<ManageSectionKey, Href> = {
  menu: '/manage/menu',
  inventory: '/manage/inventory',
  pricing: '/manage/pricing',
  clients: '/manage/clients',
  balances: '/manage/balances',
  customers: '/manage/customers',
  collections: '/manage/collections',
  shifts: '/manage/shifts',
  salary: '/manage/salary',
  loyalty: '/manage/loyalty',
  staff: '/manage/staff',
  settings: '/manage/settings',
  polls: '/manage/polls',
  about: '/manage/about',
};

/** «Управление» — разделы стеклянными группами на фирменном фоне, как касса и события. */
export default function ManageScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const club = useSession((s) => s.club);
  const sessionUser = useSession((s) => s.user);
  const me = useMe();
  const [pulling, setPulling] = useState(false);

  const nickname = me.data?.nickname ?? sessionUser?.nickname ?? '';
  const role = me.data?.role ?? sessionUser?.role ?? 'staff';
  const groups = visibleManageGroups(role, me.data?.permissions ?? null);

  const refresh = async () => {
    setPulling(true);
    await me.refetch();
    setPulling(false);
  };

  const changeClub = () =>
    Alert.alert('Сменить клуб?', 'Вы выйдете из текущего клуба.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сменить',
        onPress: async () => {
          await signOutEverywhere();
          await useSession.getState().forgetClub();
        },
      },
    ]);

  const logout = () =>
    Alert.alert('Выйти из кассы?', 'Для входа понадобится PIN или пароль.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void signOutEverywhere() },
    ]);

  return (
    <AmbientBackdrop style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, gutter, { paddingTop: insets.top }]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} progressViewOffset={insets.top} refreshing={pulling} onRefresh={refresh} />}>
        <Text style={[type.largeTitle, styles.label, styles.title]}>Управление</Text>

        <GlassCard style={styles.profile}>
          <Avatar name={nickname || '··'} photoUrl={me.data?.photoUrl} size={56} />
          <View style={styles.flex}>
            <Text style={[type.title3, styles.label]} numberOfLines={1}>
              {nickname}
            </Text>
            <Text style={[type.subhead, styles.secondary]} numberOfLines={1}>
              {`${ROLE_LABEL[role] ?? role} · ${club?.name ?? ''}`}
            </Text>
          </View>
        </GlassCard>

        {groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={[type.footnote, styles.groupTitle]}>{group.title.toUpperCase()}</Text>
            <GlassCard>
              {group.items.map((item, index) => (
                <View key={item.key}>
                  {index > 0 && <View style={styles.separator} />}
                  <Pressable
                    onPress={() => {
                      haptic.selection();
                      // Сотруднику раздел «Пользователи» показывается как «Мой профиль» — ведём сразу туда.
                      router.push(item.key === 'staff' && role !== 'owner' ? '/manage/staff/me' : SECTION_SCREENS[item.key]);
                    }}
                    style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}
                    accessibilityRole="button">
                    <View style={[styles.icon, { backgroundColor: ICON_COLORS[item.color] }]}>
                      <SymbolView name={item.icon} size={16} weight="semibold" tintColor="white" />
                    </View>
                    <Text style={[type.body, styles.label, styles.flex]}>{item.title}</Text>
                    <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />
                  </Pressable>
                </View>
              ))}
            </GlassCard>
          </View>
        ))}

        <GlassCard>
          <Pressable onPress={changeClub} style={({ pressed }) => [styles.row, pressed && styles.pressedRow]} accessibilityRole="button">
            <View style={[styles.icon, { backgroundColor: ICON_COLORS.indigo }]}>
              <SymbolView name="arrow.left.arrow.right" size={15} weight="semibold" tintColor="white" />
            </View>
            <Text style={[type.body, styles.label, styles.flex]}>Сменить клуб</Text>
          </Pressable>
          <View style={styles.separator} />
          <Pressable onPress={logout} style={({ pressed }) => [styles.row, pressed && styles.pressedRow]} accessibilityRole="button">
            <View style={[styles.icon, { backgroundColor: ICON_COLORS.red }]}>
              <SymbolView name="rectangle.portrait.and.arrow.right" size={15} weight="semibold" tintColor="white" />
            </View>
            <Text style={[type.body, styles.destructive, styles.flex]}>Выйти</Text>
          </Pressable>
        </GlassCard>
      </ScrollView>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  title: { paddingTop: space.xs, paddingHorizontal: 2 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  destructive: { color: colors.red },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  group: { gap: space.sm },
  groupTitle: { color: colors.secondaryLabel, paddingHorizontal: space.xs, fontWeight: '600', letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 52 },
  pressedRow: { backgroundColor: colors.fill },
  icon: { width: 30, height: 30, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 58 },
});
