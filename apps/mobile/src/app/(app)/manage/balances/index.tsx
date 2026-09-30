import { ContentUnavailableView, Form, HStack, Host, Picker, ProgressView, Section, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, monospacedDigit, pickerStyle, refreshable, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { ClientLine } from '@/components/client-line';
import { primary, SearchRow, secondary } from '@/components/native-form';
import { useDebounced } from '@/components/player-picker';
import { ToolbarButton } from '@/components/toolbar';
import { useBalances, useClientTiers } from '@/lib/clients-api';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';

type Tab = 'all' | 'deposits' | 'debts';

const DEPOSIT = '#06B6D4';
const DEBT = '#F43F5E';

/**
 * Депозиты и долги клиентов: итоги, фильтр, поиск и список по сумме. Тап открывает
 * карточку клиента, где пополняют, списывают и гасят долг.
 */
export default function BalancesScreen() {
  const router = useRouter();
  const balances = useBalances();
  const tiers = useClientTiers();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 200).trim().toLowerCase();

  const all = useMemo(() => balances.data ?? [], [balances.data]);
  const deposits = all.filter((c) => toNumber(c.balance) > 0).sort((a, b) => toNumber(b.balance) - toNumber(a.balance));
  const debts = all.filter((c) => toNumber(c.balance) < 0).sort((a, b) => toNumber(a.balance) - toNumber(b.balance));
  const depositTotal = deposits.reduce((sum, c) => sum + toNumber(c.balance), 0);
  const debtTotal = debts.reduce((sum, c) => sum - toNumber(c.balance), 0);
  const net = depositTotal - debtTotal;
  const inTab = tab === 'deposits' ? deposits : tab === 'debts' ? debts : all;
  const visible = search ? inTab.filter((c) => c.nickname.toLowerCase().includes(search) || (c.phone ?? '').includes(search)) : inTab;
  const people = (n: number) => `${n} ${plural(n, ['клиент', 'клиента', 'клиентов'])}`;

  return (
    <>
      <Stack.Title>Депозиты и долги</Stack.Title>
      <Stack.Toolbar placement="right">
        {/* В списке только клиенты с ненулевым балансом — операция для любого другого начинается отсюда. */}
        <ToolbarButton icon="person.crop.circle.badge.plus" accessibilityLabel="Операция с балансом другого клиента" onPress={() => router.push('/manage/balances/find')} />
      </Stack.Toolbar>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[refreshable(async () => void (await balances.refetch()))]}>
          <Section
            footer={
              balances.data ? (
                <Text>{Math.abs(net) < 0.005 ? 'Депозиты и долги уравновешены.' : `Сальдо ${formatMoney(net, { sign: true, kopecks: 'auto' })} — ${net > 0 ? 'клуб должен клиентам' : 'клиенты должны клубу'}.`}</Text>
              ) : undefined
            }>
            <HStack spacing={12}>
              <SumTile label="Депозиты" color={DEPOSIT} value={formatMoney(depositTotal, { kopecks: 'auto' })} caption={people(deposits.length)} />
              <SumTile label="Долги" color={DEBT} value={formatMoney(debtTotal, { kopecks: 'auto' })} caption={people(debts.length)} />
            </HStack>
          </Section>

          <Section>
            <Picker
              selection={tab}
              onSelectionChange={(value) => {
                haptic.selection();
                setTab(value as Tab);
              }}
              modifiers={[pickerStyle('segmented')]}>
              <Text modifiers={[tag('all')]}>{`Все · ${all.length}`}</Text>
              <Text modifiers={[tag('deposits')]}>{`Депозиты · ${deposits.length}`}</Text>
              <Text modifiers={[tag('debts')]}>{`Долги · ${debts.length}`}</Text>
            </Picker>
            <SearchRow placeholder="Ник или телефон" onChange={setQuery} />
          </Section>

          <Section footer={<Text>В списке только клиенты с депозитом или долгом. Для любого другого — кнопка вверху справа.</Text>}>
            {balances.isLoading ? (
              <ProgressView />
            ) : balances.isError && all.length === 0 ? (
              <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={balances.error.message} />
            ) : visible.length === 0 ? (
              <ContentUnavailableView
                title={search ? 'Никого не нашли' : tab === 'debts' ? 'Должников нет' : tab === 'deposits' ? 'Депозитов нет' : 'Балансов нет'}
                systemImage={search ? 'magnifyingglass' : tab === 'debts' ? 'checkmark.seal' : 'wallet.bifold'}
              />
            ) : (
              visible.map((client) => {
                const balance = toNumber(client.balance);
                return (
                  <ClientLine
                    key={client.id}
                    client={client}
                    tiers={tiers.data}
                    onPress={() => router.push({ pathname: '/manage/clients/[clientId]', params: { clientId: client.id } })}
                    trailing={
                      <VStack alignment="trailing" spacing={1}>
                        <Text modifiers={[font({ weight: 'semibold' }), foregroundStyle(balance > 0 ? DEPOSIT : DEBT), monospacedDigit()]}>{formatMoney(Math.abs(balance), { kopecks: 'auto' })}</Text>
                        <Text modifiers={[font({ textStyle: 'caption' }), secondary]}>{balance > 0 ? 'депозит' : 'долг'}</Text>
                      </VStack>
                    }
                  />
                );
              })
            )}
          </Section>
        </Form>
      </Host>
    </>
  );
}

/** Итог с цветной подписью: депозиты бирюзовым, долги красным. */
function SumTile({ label, color, value, caption }: { label: string; color: string; value: string; caption: string }) {
  return (
    <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: 10_000, alignment: 'leading' })]}>
      <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), foregroundStyle(color)]}>{label}</Text>
      <Text modifiers={[font({ textStyle: 'title3', weight: 'semibold', design: 'rounded' }), primary, monospacedDigit()]}>{value}</Text>
      <Text modifiers={[font({ textStyle: 'caption' }), secondary]}>{caption}</Text>
    </VStack>
  );
}
