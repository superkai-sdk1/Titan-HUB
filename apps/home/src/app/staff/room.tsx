// Устройства кабинки: сотрудник выбирает в Home Assistant до двух групп света и
// кондиционер и подписывает их для гостя. Сохраняется на сервере в зоне.
// ?spaceId= — любая кабинка клуба (экран «Кабинки»), без него — кабинка этого планшета.
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Icon, IconButton, Loader, Tap } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { toast } from '@/lib/flow';
import { haGetStates, type HaEntity, useHa } from '@/lib/home-assistant';
import { invalidate, useHost, useSmartHome } from '@/lib/queries';
import { LIGHT_DOMAINS } from '@/lib/room';
import { useSession } from '@/lib/session';
import { fetchBooths, saveBoothRoom, staffUnlocked, useStaff } from '@/lib/staff';
import { colors, GUTTER, radius, space, type } from '@/lib/theme';
import type { SmartDevice, SmartRoom } from '@/lib/types';

const MAX_LIGHTS = 2;

const friendly = (e: HaEntity) => (typeof e.attributes.friendly_name === 'string' ? e.attributes.friendly_name : e.entity_id);
const domainOf = (id: string) => id.split('.')[0] ?? '';

export default function RoomSetupScreen() {
  const router = useRouter();
  const host = useHost();
  const params = useLocalSearchParams<{ spaceId?: string }>();
  const currentId = useSession((s) => s.space?.id ?? null);
  const spaceId = params.spaceId && params.spaceId !== currentId ? params.spaceId : null;
  const smart = useSmartHome();
  const booths = useQuery({ queryKey: [host, 'booths'], queryFn: fetchBooths, enabled: !!spaceId, staleTime: 10_000, retry: false });
  const booth = spaceId ? (booths.data ?? []).find((b) => b.id === spaceId) : null;
  const initial = spaceId ? booth?.room : smart.data?.room;
  const status = useHa((s) => s.status);
  const touch = useStaff((s) => s.touch);
  const states = useQuery({
    queryKey: ['ha-states', status],
    queryFn: haGetStates,
    enabled: status === 'connected',
    staleTime: 30_000,
  });

  if (!staffUnlocked()) return <Redirect href="/staff" />;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" label="Назад" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>{booth ? `Устройства: ${booth.name}` : 'Устройства кабинки'}</Text>
          <Text style={type.caption}>Что гость увидит в панели «Свет и климат»</Text>
        </View>
      </View>
      {status !== 'connected' ? (
        <Loader label={status === 'auth_failed' ? 'Home Assistant не принял токен — проверьте его в Titan HUB → Интеграции' : status === 'offline' ? 'Нет связи с Home Assistant — проверьте адрес и Wi-Fi планшета' : 'Подключаемся к Home Assistant…'} />
      ) : spaceId && booths.isError ? (
        <Loader label={errorText(booths.error)} />
      ) : states.isLoading || !initial ? (
        <Loader label="Загружаем устройства…" />
      ) : states.isError ? (
        <Loader label={errorText(states.error)} />
      ) : (
        <Editor key={JSON.stringify(initial)} initial={initial} spaceId={spaceId} entities={states.data ?? []} onTouch={touch} onSaved={() => router.back()} />
      )}
    </View>
  );
}

function Editor({
  initial,
  spaceId,
  entities,
  onTouch,
  onSaved,
}: {
  initial: SmartRoom;
  /** Чужая кабинка (служебный токен сотрудника); null — кабинка этого планшета. */
  spaceId: string | null;
  entities: HaEntity[];
  onTouch: () => void;
  onSaved: () => void;
}) {
  const [lights, setLights] = useState<SmartDevice[]>(initial.lights);
  const [climate, setClimate] = useState<SmartDevice | null>(initial.climate);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const q = query.trim().toLowerCase();
  const match = (e: HaEntity) => !q || friendly(e).toLowerCase().includes(q) || e.entity_id.includes(q);
  const lightEntities = entities.filter((e) => LIGHT_DOMAINS.includes(domainOf(e.entity_id)) && match(e)).sort((a, b) => friendly(a).localeCompare(friendly(b), 'ru'));
  const climateEntities = entities.filter((e) => domainOf(e.entity_id) === 'climate' && match(e)).sort((a, b) => friendly(a).localeCompare(friendly(b), 'ru'));

  const toggleLight = (e: HaEntity) => {
    onTouch();
    setLights((cur) => {
      if (cur.some((l) => l.entityId === e.entity_id)) return cur.filter((l) => l.entityId !== e.entity_id);
      if (cur.length >= MAX_LIGHTS) {
        toast(`Не больше ${MAX_LIGHTS} групп света — снимите одну`, 'warning');
        return cur;
      }
      return [...cur, { entityId: e.entity_id, name: cur.length === 0 ? 'Основной свет' : 'Подсветка' }];
    });
  };

  const save = async () => {
    onTouch();
    const room: SmartRoom = {
      lights: lights.map((l) => ({ ...l, name: l.name.trim() || 'Свет' })),
      climate: climate ? { ...climate, name: climate.name.trim() || 'Кондиционер' } : null,
    };
    setSaving(true);
    try {
      if (spaceId) await saveBoothRoom(spaceId, room);
      else await api.put('/pos/tablet/smart-home', room);
      await Promise.all([invalidate('smart-home'), invalidate('booths')]);
      toast('Устройства кабинки сохранены');
      onSaved();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onScrollBeginDrag={onTouch}>
      <View style={styles.search}>
        <Icon name="magnify" size={22} color={colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Поиск устройства" placeholderTextColor={colors.textMuted} style={styles.searchInput} />
      </View>

      <View style={styles.columns}>
        <View style={styles.column}>
          <Text style={type.overline}>Свет · до {MAX_LIGHTS} групп, только вкл/выкл</Text>
          {lights.map((l, i) => (
            <View key={l.entityId} style={styles.selected}>
              <Icon name="lightbulb-on" size={22} color={colors.amber} />
              <TextInput
                value={l.name}
                onChangeText={(name) => setLights((cur) => cur.map((x, j) => (j === i ? { ...x, name } : x)))}
                maxLength={40}
                style={styles.nameInput}
                placeholder="Подпись для гостя"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.entityId} numberOfLines={1}>{l.entityId}</Text>
            </View>
          ))}
          <View style={styles.list}>
            {lightEntities.map((e) => (
              <EntityRow key={e.entity_id} entity={e} selected={lights.some((l) => l.entityId === e.entity_id)} onPress={() => toggleLight(e)} />
            ))}
            {!lightEntities.length ? <Text style={styles.none}>Нет света и выключателей</Text> : null}
          </View>
        </View>

        <View style={styles.column}>
          <Text style={type.overline}>Кондиционер</Text>
          {climate ? (
            <View style={styles.selected}>
              <Icon name="air-conditioner" size={22} color={colors.cyan} />
              <TextInput
                value={climate.name}
                onChangeText={(name) => setClimate((c) => (c ? { ...c, name } : c))}
                maxLength={40}
                style={styles.nameInput}
                placeholder="Подпись для гостя"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.entityId} numberOfLines={1}>{climate.entityId}</Text>
            </View>
          ) : null}
          <View style={styles.list}>
            {climateEntities.map((e) => {
              const selected = climate?.entityId === e.entity_id;
              return (
                <EntityRow
                  key={e.entity_id}
                  entity={e}
                  selected={selected}
                  radio
                  onPress={() => { onTouch(); setClimate(selected ? null : { entityId: e.entity_id, name: 'Кондиционер' }); }}
                />
              );
            })}
            {!climateEntities.length ? <Text style={styles.none}>Нет климат-устройств</Text> : null}
          </View>
        </View>
      </View>

      <Button title="Сохранить" icon="content-save-outline" variant="brand" size="xl" onPress={() => void save()} loading={saving} />
    </ScrollView>
  );
}

function EntityRow({ entity, selected, onPress, radio }: { entity: HaEntity; selected: boolean; onPress: () => void; radio?: boolean }) {
  const icon = radio
    ? selected ? 'radiobox-marked' : 'radiobox-blank'
    : selected ? 'checkbox-marked' : 'checkbox-blank-outline';
  return (
    <Tap style={[styles.row, selected && styles.rowOn]} onPress={onPress} scaleTo={0.98} accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityState={{ checked: selected }}>
      <Icon name={icon} size={24} color={selected ? colors.violetLight : colors.textMuted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{friendly(entity)}</Text>
        <Text style={styles.rowId} numberOfLines={1}>{entity.entity_id} · {entity.state}</Text>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.md },
  body: { padding: GUTTER, paddingTop: space.sm, gap: space.xl },
  search: {
    height: 52, borderRadius: 26, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  column: { flexGrow: 1, flexBasis: 360, gap: space.md },
  selected: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingLeft: space.lg, borderRadius: radius.tile,
    backgroundColor: colors.violetTint, borderWidth: 1, borderColor: colors.borderViolet,
  },
  nameInput: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text, paddingVertical: 6 },
  entityId: { maxWidth: '40%', fontSize: 12, color: colors.textSecondary },
  list: { borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowOn: { backgroundColor: 'rgba(139,92,246,0.08)' },
  rowName: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowId: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  none: { padding: space.lg, color: colors.textMuted, fontSize: 15 },
});
