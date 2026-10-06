// Кнопка в шапке: состояние комнаты («Свет вкл · 22°»). По нажатию справа
// выезжает панель «Свет и климат».
import { ChevronLeft, Lightbulb, Thermometer } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useVisit } from '@/features/visit/store';
import { glassStyle } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { Press } from '@/ui/press';
import { T } from '@/ui/text';
import { color, radius } from '@/ui/tokens';

import { useHa } from './ha';
import { climateInfo, fmtTemp, HVAC_ICON, HVAC_TONE, isOn } from './room';
import { useRoom } from './use-room';

export function RoomButton({ compact }: { compact?: boolean }) {
  const { room, configured } = useRoom();
  const status = useHa((s) => s.status);
  const lightsOn = useHa((s) => (room ? room.lights.filter((l) => isOn(s.entities[l.entityId])).length : 0));
  const climate = useHa((s) => (room?.climate ? s.entities[room.climate.entityId] : undefined));
  if (!configured || !room) return null;

  const info = climateInfo(climate);
  const climateOn = !!room.climate && info.mode !== 'off' && !!climate;
  const ModeIcon = climateOn ? HVAC_ICON[info.mode] ?? Thermometer : Thermometer;
  const modeTone = climateOn ? HVAC_TONE[info.mode] ?? color.text : color.textSecondary;
  const offline = status !== 'connected';

  return (
    <Press
      onPress={() => useVisit.getState().setRoom(true)}
      accessibilityLabel="Свет и климат"
      style={[styles.button, glassStyle('control', radius.pill)]}
    >
      {room.lights.length ? (
        <View style={styles.part}>
          <Icon as={Lightbulb} size={22} tone={lightsOn ? color.warm : color.textSecondary} />
          {compact ? null : <T variant="label">{lightsOn ? 'Свет вкл' : 'Свет выкл'}</T>}
        </View>
      ) : null}
      {room.lights.length && room.climate ? <View style={styles.divider} /> : null}
      {room.climate ? (
        <View style={styles.part}>
          <Icon as={ModeIcon} size={20} tone={modeTone} />
          <T variant="label" numeric>{climateOn && info.target != null ? `${fmtTemp(info.target)}°` : info.current != null ? `${fmtTemp(info.current)}°` : '—'}</T>
        </View>
      ) : null}
      {offline ? <View style={styles.offlineDot} /> : <Icon as={ChevronLeft} size={20} tone={color.textTertiary} stroke={2} />}
    </Press>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, paddingLeft: 18, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { width: 1, height: 22, backgroundColor: 'rgba(255,255,255,0.18)' },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.amber, marginLeft: 4 },
});
