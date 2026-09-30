import { StyleSheet, Text, View } from 'react-native';

import { colors, type } from '@/lib/theme';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Теплокарта «день недели × час открытия чека»: чем насыщеннее клетка, тем больше
 * оборот. Часы — только рабочие (от первого до последнего часа с чеками), вечер клуба
 * заходит за полночь, поэтому ряд часов начинается с утреннего порога дня клуба.
 */
export function Heatmap({
  cells,
  startHour,
  width,
  color,
}: {
  cells: { dow: number; hour: number; revenue: number }[];
  startHour: number;
  width: number;
  color: string;
}) {
  // Часы в порядке дня клуба: startHour, startHour+1, … 23, 0, … startHour−1.
  const order = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);
  const active = order.filter((hour) => cells.some((c) => c.hour === hour && c.revenue > 0));
  if (active.length === 0) return null;
  const first = order.indexOf(active[0]);
  const last = order.indexOf(active[active.length - 1]);
  const hours = order.slice(first, last + 1);

  const max = Math.max(...cells.map((c) => c.revenue), 1);
  const labelWidth = 26;
  const gap = 3;
  const cell = Math.max(10, Math.floor((width - labelWidth - gap * hours.length) / hours.length));
  const value = (dow: number, hour: number) => cells.find((c) => c.dow === dow && c.hour === hour)?.revenue ?? 0;

  return (
    <View style={{ width, gap }}>
      {DAYS.map((day, index) => (
        <View key={day} style={[styles.row, { gap }]}>
          <Text style={[type.caption2, styles.label, { width: labelWidth }]}>{day}</Text>
          {hours.map((hour) => {
            const v = value(index + 1, hour);
            return (
              <View
                key={hour}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 3,
                  backgroundColor: v > 0 ? color : colors.fill,
                  opacity: v > 0 ? 0.18 + 0.82 * (v / max) : 1,
                }}
              />
            );
          })}
        </View>
      ))}
      <View style={[styles.row, { gap, marginLeft: labelWidth + gap }]}>
        {hours.map((hour, index) => (
          <Text key={hour} style={[type.caption2, styles.label, { width: cell, textAlign: 'center' }]}>
            {index % 3 === 0 ? String(hour) : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { color: colors.secondaryLabel },
});
