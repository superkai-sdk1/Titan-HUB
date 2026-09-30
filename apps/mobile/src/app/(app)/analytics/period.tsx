import { DatePicker, Form, Host, Section, Text } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { EditorToolbar } from '@/components/editor-toolbar';
import { daysBetween, useAnalyticsPeriod, useAnalyticsPeriodStore } from '@/lib/analytics-api';
import { fromDateTime, toDateString } from '@/lib/events-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';

/** Свой период отчётов: даты начала и конца — бизнес-дни клуба. */
export default function PeriodSheet() {
  const router = useRouter();
  const period = useAnalyticsPeriod();
  const setCustom = useAnalyticsPeriodStore((s) => s.setCustom);
  const [from, setFrom] = useState(() => fromDateTime(period.from, '12:00'));
  const [to, setTo] = useState(() => fromDateTime(period.to, '12:00'));

  const fromKey = toDateString(from);
  const toKey = toDateString(to);
  const days = daysBetween(fromKey <= toKey ? fromKey : toKey, fromKey <= toKey ? toKey : fromKey);

  return (
    <>
      <EditorToolbar
        title="Период"
        canSave
        saveLabel="Показать"
        onSave={() => {
          haptic.selection();
          setCustom(fromKey, toKey);
          router.back();
        }}
      />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section footer={<Text>{`${days} ${plural(days, ['бизнес-день', 'бизнес-дня', 'бизнес-дней'])}. День клуба начинается в час из настроек, а не в полночь.`}</Text>}>
            <DatePicker title="С" selection={from} displayedComponents={['date']} range={{ end: new Date() }} onDateChange={setFrom} />
            <DatePicker title="По" selection={to} displayedComponents={['date']} range={{ end: new Date() }} onDateChange={setTo} />
          </Section>
        </Form>
      </Host>
    </>
  );
}
