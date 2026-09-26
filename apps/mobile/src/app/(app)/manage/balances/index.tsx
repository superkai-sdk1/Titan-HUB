import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { GlassView } from '@/components/glass';
import { useDebounced } from '@/components/player-picker';
import { BottomSearch, useSearchClearance } from '@/components/bottom-search';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { ClientRow } from '@/components/client-row';
import { RollingText } from '@/components/rolling-text';
import { Unavailable } from '@/components/unavailable';
import { useBalances, useClientTiers } from '@/lib/clients-api';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton } from '@/components/toolbar';

type Tab = 'all' | 'deposits' | 'debts';

const DEPOSIT = '#06B6D4';
const DEBT = '#F43F5E';
const rowLayout = LinearTransition.springify().damping(22).stiffness(220);

/**
 * Депозиты и долги клиентов: итоги плитками (они же фильтр), список по сумме.
 * Тап открывает карточку клиента, где пополняют, списывают и гасят долг.
 */
export default function BalancesScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const balances = useBalances();
  const tiers = useClientTiers();
  const [tab, setTab] = useState<Tab>('all');
  const [pulling, setPulling] = useState(false);
  const [query, setQuery] = useState('');
  const searchClearance = useSearchClearance();
  const search = useDebounced(query, 200).trim().toLowerCase();

  const all = useMemo(() => balances.data ?? [], [balances.data]);
  const deposits = all.filter((c) => toNumber(c.balance) > 0);
  const debts = all.filter((c) => toNumber(c.balance) < 0).sort((a, b) => toNumber(a.balance) - toNumber(b.balance));
  const depositTotal = deposits.reduce((sum, c) => sum + toNumber(c.balance), 0);
  const debtTotal = debts.reduce((sum, c) => sum - toNumber(c.balance), 0);
  const net = depositTotal - debtTotal;
  const inTab = tab === 'deposits' ? deposits : tab === 'debts' ? debts : all;
  const visible = search ? inTab.filter((c) => c.nickname.toLowerCase().includes(search) || (c.phone ?? '').includes(search)) : inTab;

  const refresh = async () => {
    setPulling(true);
    await balances.refetch();
    setPulling(false);
  };

  const select = (next: Tab) => {
    haptic.selection();
    setTab((current) => (current === next ? 'all' : next));
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Депозиты и долги</Stack.Title>
      <Stack.Toolbar placement="right">
        {/* В списке только клиенты с ненулевым балансом — операция для любого другого начинается отсюда. */}
        <ToolbarButton icon="person.crop.circle.badge.plus" accessibilityLabel="Операция с балансом другого клиента" onPress={() => router.push('/manage/balances/find')} />
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter, { paddingBottom: searchClearance }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <View style={styles.tiles}>
          <SummaryTile
            title="Депозиты"
            icon="wallet.bifold.fill"
            color={DEPOSIT}
            amount={depositTotal}
            count={deposits.length}
            active={tab === 'deposits'}
            onPress={() => select('deposits')}
          />
          <SummaryTile title="Долги" icon="exclamationmark.circle.fill" color={DEBT} amount={debtTotal} count={debts.length} active={tab === 'debts'} onPress={() => select('debts')} />
        </View>
        {balances.data && (
          <Text style={[type.footnote, styles.net]}>
            {Math.abs(net) < 0.005 ? 'Депозиты и долги уравновешены' : `Сальдо ${formatMoney(net, { sign: true, kopecks: 'auto' })} — ${net > 0 ? 'клуб должен клиентам' : 'клиенты должны клубу'}`}
          </Text>
        )}

        <Host matchContents={{ vertical: true }} style={styles.segment}>
          <Picker
            selection={tab}
            onSelectionChange={(value) => {
              haptic.selection();
              setTab(value as Tab);
            }}
            modifiers={[pickerStyle('segmented')]}>
            <SwiftText modifiers={[tag('all')]}>{`Все · ${all.length}`}</SwiftText>
            <SwiftText modifiers={[tag('deposits')]}>{`Депозиты · ${deposits.length}`}</SwiftText>
            <SwiftText modifiers={[tag('debts')]}>{`Долги · ${debts.length}`}</SwiftText>
          </Picker>
        </Host>

        {balances.isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : balances.isError && all.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable title="Нет связи" systemImage="wifi.exclamationmark" description={balances.error.message} />
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable
              title={search ? 'Никого не нашли' : tab === 'debts' ? 'Должников нет' : tab === 'deposits' ? 'Депозитов нет' : 'Балансов нет'}
              systemImage={search ? 'magnifyingglass' : tab === 'debts' ? 'checkmark.seal' : 'wallet.bifold'}
              description={
                search
                  ? 'В списке только клиенты с депозитом или долгом. Для любого другого — кнопка вверху справа.'
                  : 'Чтобы пополнить депозит или записать долг, начните с кнопки вверху справа.'
              }
            />
          </View>
        ) : (
          <LayoutAnimationConfig skipEntering>
            <View style={styles.list}>
              {visible.map((client) => {
                const balance = toNumber(client.balance);
                return (
                  <Animated.View key={client.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                    <ClientRow
                      client={client}
                      tiers={tiers.data}
                      onPress={() => router.push({ pathname: '/manage/clients/[clientId]', params: { clientId: client.id } })}
                      trailing={
                        <View style={styles.amount}>
                          <Text style={[type.headline, type.amount, { color: balance > 0 ? DEPOSIT : DEBT }]}>{formatMoney(Math.abs(balance), { kopecks: 'auto' })}</Text>
                          <Text style={[type.caption1, styles.secondary]}>{balance > 0 ? 'депозит' : 'долг'}</Text>
                        </View>
                      }
                    />
                  </Animated.View>
                );
              })}
            </View>
          </LayoutAnimationConfig>
        )}
      </ScrollView>
      <BottomSearch value={query} onChange={setQuery} placeholder="Ник или телефон" />
    </AmbientBackdrop>
  );
}

function SummaryTile({
  title,
  icon,
  color,
  amount,
  count,
  active,
  onPress,
}: {
  title: string;
  icon: SFSymbol;
  color: string;
  amount: number;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.flex} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <GlassView isInteractive tintColor={active ? `${color}59` : `${color}1F`} style={styles.tile}>
        <View style={styles.tileTop}>
          <SymbolView name={icon} size={15} tintColor={color} />
          <Text style={[type.footnote, styles.tileTitle, { color }]}>{title}</Text>
        </View>
        <RollingText text={formatMoney(amount)} style={[type.title2, type.amount, styles.label]} />
        <Text style={[type.caption1, styles.secondary]}>{`${count} ${plural(count, ['клиент', 'клиента', 'клиентов'])}`}</Text>
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tiles: { flexDirection: 'row', gap: space.md },
  tile: { padding: space.lg, gap: 4, borderRadius: 22, borderCurve: 'continuous' },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileTitle: { fontWeight: '600' },
  net: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  segment: { alignSelf: 'stretch', marginTop: space.xs },
  loading: { paddingTop: 60 },
  empty: { height: 340 },
  list: { gap: space.sm },
  amount: { alignItems: 'flex-end' },
});
