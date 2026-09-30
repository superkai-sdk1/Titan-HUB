import { Button, ContentUnavailableView, Form, HStack, Host, Image, ProgressView, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, buttonStyle, font, frame, lineLimit, refreshable, shapes } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ActionRow, primary, SearchRow, secondary } from '@/components/native-form';
import { useDebounced } from '@/components/player-picker';
import { useCustomerList, type CustomerRow } from '@/lib/clients-api';
import { normalizePhone } from '@/lib/events-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';

/**
 * Заказчики мероприятий — контакты, которые копятся из броней и мероприятий.
 * Позвонить или написать можно прямо из списка; тап по имени открывает карточку для правки.
 */
export default function CustomersScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 300);
  const customers = useCustomerList(search);
  const list = customers.data ?? [];
  const searching = search.trim().length > 0;

  const open = (customer?: CustomerRow) => {
    haptic.light();
    router.push(
      customer
        ? { pathname: '/manage/customers/edit', params: { customerId: customer.id, name: customer.name ?? '', phone: customer.phone ?? '' } }
        : '/manage/customers/edit',
    );
  };

  const caption = searching
    ? list.length >= 8
      ? 'Первые 8 совпадений — уточните запрос'
      : `Найдено: ${list.length}`
    : `${list.length} ${plural(list.length, ['заказчик', 'заказчика', 'заказчиков'])}`;

  return (
    <>
      <Stack.Title>Заказчики</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await customers.refetch()))]}>
          <Section>
            <SearchRow placeholder="Имя или телефон" onChange={setQuery} />
          </Section>

          <Section title={customers.data ? caption : undefined} footer={<Text>Контакты появляются из броней и мероприятий. Кнопки справа — позвонить, WhatsApp, Telegram.</Text>}>
            {customers.isLoading ? (
              <ProgressView />
            ) : customers.isError && list.length === 0 ? (
              <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={customers.error.message} />
            ) : list.length === 0 ? (
              <ContentUnavailableView title={searching ? 'Никого не нашли' : 'Заказчиков нет'} systemImage="person.crop.rectangle.stack" description={searching ? 'Проверьте имя или номер.' : undefined} />
            ) : (
              list.map((customer) => <CustomerLine key={customer.id} customer={customer} onOpen={() => open(customer)} />)
            )}
            <ActionRow title="Новый заказчик" icon="plus.circle.fill" onPress={() => open()} />
          </Section>
        </Form>
      </Host>
    </>
  );
}

function CustomerLine({ customer, onOpen }: { customer: CustomerRow; onOpen: () => void }) {
  const phone = customer.phone ? normalizePhone(customer.phone) : null;
  return (
    <HStack spacing={10}>
      <Button onPress={onOpen} modifiers={[buttonStyle('borderless')]}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[customer.name ? primary : secondary, font({ weight: 'semibold' }), lineLimit(1)]}>{customer.name || 'Без имени'}</Text>
          <Text modifiers={[font({ textStyle: 'subheadline' }), secondary, lineLimit(1)]}>{customer.phone || 'Нет телефона'}</Text>
        </VStack>
      </Button>
      <Spacer />
      {phone ? (
        <>
          <Quick icon="phone.fill" color="#34C759" onPress={() => void Linking.openURL(`tel:+${phone}`)} />
          <Quick icon="message.fill" color="#25D366" onPress={() => void Linking.openURL(`https://wa.me/${phone}`)} />
          <Quick icon="paperplane.fill" color="#32ADE6" onPress={() => void Linking.openURL(`tg://resolve?phone=${phone}`)} />
        </>
      ) : null}
    </HStack>
  );
}

/** Круглая кнопка быстрого действия в строке — отдельная от нажатия на имя. */
function Quick({ icon, color, onPress }: { icon: SFSymbol; color: string; onPress: () => void }) {
  return (
    <Image
      systemName={icon}
      size={13}
      color="white"
      modifiers={[frame({ width: 30, height: 30 }), background(color, shapes.circle())]}
      onPress={() => {
        haptic.light();
        onPress();
      }}
    />
  );
}
