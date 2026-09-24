import { DatePicker, Host } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { daysBetween, useAnalyticsPeriod, useAnalyticsPeriodStore } from '@/lib/analytics-api';
import { fromDateTime, toDateString } from '@/lib/events-api';
import { haptic } from '@/lib/haptics';
import { plural } from '@/lib/format';
import { space, type, useAccentHex } from '@/lib/theme';

/** Свой период отчётов: даты начала и конца — бизнес-дни клуба. */
export default function PeriodSheet() {
  const router = useRouter();
  const accent = useAccentHex();
  const period = useAnalyticsPeriod();
  const setCustom = useAnalyticsPeriodStore((s) => s.setCustom);
  const [from, setFrom] = useState(() => fromDateTime(period.from, '12:00'));
  const [to, setTo] = useState(() => fromDateTime(period.to, '12:00'));

  const fromKey = toDateString(from);
  const toKey = toDateString(to);
  const days = daysBetween(fromKey <= toKey ? fromKey : toKey, fromKey <= toKey ? toKey : fromKey);

  return (
    <View style={styles.sheet}>
      <SheetHeader title="Период" onClose={() => router.back()} />
      <GlassCard style={styles.card}>
        <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
          <DatePicker title="С" selection={from} displayedComponents={['date']} onDateChange={setFrom} />
        </Host>
        <View style={sheetStyles.separator} />
        <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
          <DatePicker title="По" selection={to} displayedComponents={['date']} onDateChange={setTo} />
        </Host>
      </GlassCard>
      <Text style={[type.footnote, sheetStyles.secondary, styles.hint]}>
        {`${days} ${plural(days, ['бизнес-день', 'бизнес-дня', 'бизнес-дней'])}. День клуба начинается в час из настроек, а не в полночь.`}
      </Text>
      <PrimaryButton
        title="Показать отчёты"
        icon="calendar"
        onPress={() => {
          haptic.selection();
          setCustom(fromKey, toKey);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xl, gap: space.md },
  card: { paddingHorizontal: space.lg },
  control: { alignSelf: 'stretch', paddingVertical: space.sm },
  hint: { paddingHorizontal: space.xs },
});
