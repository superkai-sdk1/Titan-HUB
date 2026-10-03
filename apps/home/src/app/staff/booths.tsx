// Кабинки клуба: перенести планшет в другую кабинку (без повторной настройки — у
// каждой кабинки свои устройства умного дома) и настроить устройства любой из них.
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Icon, IconButton, Loader } from '@/components/ui';
import { errorText } from '@/lib/api';
import { toast } from '@/lib/flow';
import { useHost } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { type Booth, fetchBooths, staffUnlocked, switchBooth, useStaff } from '@/lib/staff';
import { colors, GUTTER, radius, space, type } from '@/lib/theme';

export default function BoothsScreen() {
  const router = useRouter();
  const host = useHost();
  const current = useSession((s) => s.space?.id ?? null);
  const touch = useStaff((s) => s.touch);
  const [moving, setMoving] = useState<string | null>(null);
  const booths = useQuery({ queryKey: [host, 'booths'], queryFn: fetchBooths, staleTime: 10_000, retry: false });

  if (!staffUnlocked()) return <Redirect href="/staff" />;

  const move = (booth: Booth) => {
    touch();
    Alert.alert(`Перенести планшет в «${booth.name}»?`, 'Экран гостя и свет с климатом переключатся на эту кабинку. PIN вводить не нужно.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Перенести',
        onPress: () => {
          setMoving(booth.id);
          switchBooth(booth.id)
            .then(() => {
              toast(`Планшет теперь в «${booth.name}»`);
              router.back();
            })
            .catch((e: unknown) => toast(errorText(e), 'error'))
            .finally(() => setMoving(null));
        },
      },
    ]);
  };

  const list = [...(booths.data ?? [])].sort((a, b) => Number(b.id === current) - Number(a.id === current));

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" label="Назад" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>Кабинки</Text>
          <Text style={type.caption}>У каждой кабинки свои свет и кондиционер — планшет берёт их при переносе</Text>
        </View>
      </View>
      {booths.isLoading ? (
        <Loader label="Загружаем кабинки…" />
      ) : booths.isError ? (
        <Loader label={errorText(booths.error)} />
      ) : (
        <ScrollView contentContainerStyle={styles.grid} onScrollBeginDrag={touch}>
          {list.map((booth) => (
            <BoothCard
              key={booth.id}
              booth={booth}
              here={booth.id === current}
              moving={moving === booth.id}
              busy={moving !== null}
              onDevices={() => {
                touch();
                router.push({ pathname: '/staff/room', params: { spaceId: booth.id } });
              }}
              onMove={() => move(booth)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function BoothCard({
  booth,
  here,
  moving,
  busy,
  onDevices,
  onMove,
}: {
  booth: Booth;
  here: boolean;
  moving: boolean;
  busy: boolean;
  onDevices: () => void;
  onMove: () => void;
}) {
  const devices = [
    ...booth.room.lights.map((l) => ({ key: l.entityId, icon: 'lightbulb-outline' as const, name: l.name, tone: colors.amber })),
    ...(booth.room.climate ? [{ key: booth.room.climate.entityId, icon: 'air-conditioner' as const, name: booth.room.climate.name, tone: colors.cyan }] : []),
  ];
  return (
    <View style={[styles.card, here && styles.cardHere]}>
      <View style={styles.cardHead}>
        <Icon name="sofa-outline" size={26} color={here ? colors.violetLight : colors.textSecondary} />
        <Text style={styles.name} numberOfLines={1}>
          {booth.name}
        </Text>
        {here ? (
          <View style={styles.badge}>
            <Icon name="tablet" size={15} color={colors.violetLight} />
            <Text style={styles.badgeText}>Этот планшет</Text>
          </View>
        ) : null}
      </View>

      {devices.length ? (
        <View style={styles.devices}>
          {devices.map((d) => (
            <View key={d.key} style={styles.device}>
              <Icon name={d.icon} size={18} color={d.tone} />
              <Text style={styles.deviceText} numberOfLines={1}>
                {d.name}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Устройства не выбраны</Text>
      )}

      <View style={styles.actions}>
        <Button title="Устройства" icon="tune-variant" variant="secondary" size="md" onPress={onDevices} disabled={busy} style={styles.action} />
        {here ? null : (
          <Button title="Перенести сюда" icon="swap-horizontal" variant="primary" size="md" onPress={onMove} loading={moving} disabled={busy} style={styles.action} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.md },
  grid: { padding: GUTTER, paddingTop: space.sm, flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  card: {
    flexGrow: 1, flexBasis: 320, gap: space.md, padding: space.lg, borderRadius: radius.card,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  cardHere: { borderColor: colors.borderViolet, backgroundColor: colors.violetTint },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(139,92,246,0.18)' },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.violetLight },
  devices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  device: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border,
  },
  deviceText: { fontSize: 14, fontWeight: '600', color: colors.textBody, flexShrink: 1 },
  empty: { fontSize: 15, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xs },
  action: { flex: 1 },
});
