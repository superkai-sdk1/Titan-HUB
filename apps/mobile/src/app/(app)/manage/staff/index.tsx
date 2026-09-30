import { Button, ContentUnavailableView, Form, HStack, Host, Image, ProgressView, RNHostView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, lineLimit, refreshable } from '@expo/ui/swift-ui/modifiers';
import { Redirect, Stack, useRouter } from 'expo-router';

import { LinkRow, primary, secondary, tertiary } from '@/components/native-form';
import { Avatar } from '@/components/new-check-parts';
import { ToolbarButton } from '@/components/toolbar';
import { useStaffAdmin, type StaffRow } from '@/lib/admin-api';
import { haptic } from '@/lib/haptics';
import { useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';

/** Сотрудники клуба: владельцы и сотрудники с правами. Сотрудник видит только свой профиль. */
export default function StaffScreen() {
  const router = useRouter();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const me = useMe();
  const staff = useStaffAdmin(isOwner);

  if (!isOwner) return <Redirect href="/manage/staff/me" />;

  const rows = staff.data ?? [];
  const owners = rows.filter((row) => row.role === 'owner');
  const workers = rows.filter((row) => row.role !== 'owner');
  const open = (row: StaffRow) => router.push({ pathname: '/manage/staff/[staffId]', params: { staffId: row.id } });

  return (
    <>
      <Stack.Title>Сотрудники</Stack.Title>
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

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await Promise.allSettled([staff.refetch(), me.refetch()])))]}>
          <Section>
            <Button
              onPress={() => {
                haptic.selection();
                router.push('/manage/staff/me');
              }}>
              <HStack spacing={14}>
                <RNHostView matchContents>
                  <Avatar name={me.data?.nickname ?? '··'} photoUrl={me.data?.photoUrl} size={50} />
                </RNHostView>
                <VStack alignment="leading" spacing={2}>
                  <Text modifiers={[font({ textStyle: 'headline' }), primary, lineLimit(1)]}>{me.data?.nickname ?? ''}</Text>
                  <Text modifiers={[font({ textStyle: 'subheadline' }), secondary]}>Мой профиль, PIN и уведомления</Text>
                </VStack>
                <Spacer />
                <Image systemName="chevron.right" size={13} modifiers={[tertiary, font({ weight: 'semibold' })]} />
              </HStack>
            </Button>
          </Section>

          {staff.isLoading ? (
            <Section>
              <ProgressView />
            </Section>
          ) : (
            <>
              <Section title="Владельцы" footer={<Text>Владелец видит всё: деньги, аналитику, настройки клуба.</Text>}>
                {owners.map((row) => (
                  <StaffLine key={row.id} row={row} onPress={() => open(row)} />
                ))}
              </Section>

              <Section title="Сотрудники" footer={<Text>Права сотрудника решают, какие разделы «Управления» он видит.</Text>}>
                {workers.length === 0 ? (
                  <ContentUnavailableView title="Сотрудников пока нет" systemImage="person.2" description="Добавьте сотрудника кнопкой «+» и настройте ему права." />
                ) : (
                  workers.map((row) => <StaffLine key={row.id} row={row} onPress={() => open(row)} />)
                )}
              </Section>
            </>
          )}
        </Form>
      </Host>
    </>
  );
}

function StaffLine({ row, onPress }: { row: StaffRow; onPress: () => void }) {
  const granted = row.permissions ? Object.values(row.permissions).filter(Boolean).length : null;
  return (
    <LinkRow
      icon={row.role === 'owner' ? 'crown.fill' : 'person.fill'}
      color={row.role === 'owner' ? '#FF9500' : '#8E8E93'}
      title={row.nickname}
      subtitle={[row.tgUsername ? `@${row.tgUsername}` : null, row.phone, row.role === 'owner' ? 'полный доступ' : granted !== null ? `${granted} прав` : 'права по умолчанию'].filter(Boolean).join(' · ')}
      onPress={onPress}
    />
  );
}
