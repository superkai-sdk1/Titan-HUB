import { Redirect, Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppRefreshControl } from '@/components/refresh-control';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Avatar, GlassCard } from '@/components/new-check-parts';
import { Group, ListNote, Row } from '@/components/settings-parts';
import { useStaffAdmin, type StaffRow } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton } from '@/components/toolbar';

/** Пользователи клуба: список сотрудников с правами. Сотрудник видит только свой профиль. */
export default function StaffScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const me = useMe();
  const staff = useStaffAdmin(isOwner);
  const [pulling, setPulling] = useState(false);

  if (!isOwner) return <Redirect href="/manage/staff/me" />;

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([staff.refetch(), me.refetch()]);
    setPulling(false);
  };

  const rows = staff.data ?? [];
  const owners = rows.filter((row) => row.role === 'owner');
  const workers = rows.filter((row) => row.role !== 'owner');

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Пользователи</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton
          icon="plus"
          accessibilityLabel="Добавить сотрудника"
          onPress={() => {
            haptic.light();
            router.push('/manage/staff/new');
          }}
        />
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <Pressable
          onPress={() => {
            haptic.selection();
            router.push('/manage/staff/me');
          }}
          style={({ pressed }) => [pressed && styles.pressed]}
          accessibilityRole="button">
          <GlassCard style={styles.profile}>
            <Avatar name={me.data?.nickname ?? '··'} photoUrl={me.data?.photoUrl} size={52} />
            <View style={styles.flex}>
              <Text style={[type.title3, styles.label]} numberOfLines={1}>
                {me.data?.nickname ?? ''}
              </Text>
              <Text style={[type.subhead, styles.secondary]}>Мой профиль, PIN и уведомления</Text>
            </View>
          </GlassCard>
        </Pressable>

        <Group title="Владельцы" footer="Владелец видит всё: деньги, аналитику, настройки клуба.">
          {owners.map((row) => (
            <StaffLine key={row.id} row={row} onPress={() => router.push({ pathname: '/manage/staff/[staffId]', params: { staffId: row.id } })} />
          ))}
        </Group>

        <Group title="Сотрудники" footer="Права сотрудника решают, какие разделы «Управления» он видит.">
          {workers.map((row) => (
            <StaffLine key={row.id} row={row} onPress={() => router.push({ pathname: '/manage/staff/[staffId]', params: { staffId: row.id } })} />
          ))}
        </Group>
        {workers.length === 0 && <ListNote loading={staff.isLoading} text="Сотрудников пока нет" systemImage="person.2" description="Добавьте сотрудника кнопкой «+» и настройте ему права." />}
      </ScrollView>
    </AmbientBackdrop>
  );
}

function StaffLine({ row, onPress }: { row: StaffRow; onPress: () => void }) {
  const granted = row.permissions ? Object.values(row.permissions).filter(Boolean).length : null;
  return (
    <Row
      icon={row.role === 'owner' ? 'crown' : 'person'}
      color={row.role === 'owner' ? '#F59E0B' : '#64748B'}
      title={row.nickname}
      subtitle={[row.tgUsername ? `@${row.tgUsername}` : null, row.phone, row.role === 'owner' ? 'полный доступ' : granted !== null ? `${granted} прав` : 'права по умолчанию'].filter(Boolean).join(' · ')}
      chevron
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  pressed: { opacity: 0.6 },
});
