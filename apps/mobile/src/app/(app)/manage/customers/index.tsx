import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AppRefreshControl } from '@/components/refresh-control';
import { GlassView } from '@/components/glass';
import { BottomSearch, useSearchClearance } from '@/components/bottom-search';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { useDebounced } from '@/components/player-picker';
import { Unavailable } from '@/components/unavailable';
import { useCustomerList, type CustomerRow } from '@/lib/clients-api';
import { normalizePhone } from '@/lib/events-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton } from '@/components/toolbar';

const rowLayout = LinearTransition.springify().damping(22).stiffness(220);

/**
 * Заказчики мероприятий — контакты, которые копятся из броней и мероприятий.
 * Позвонить или написать можно прямо из списка; тап открывает карточку для правки.
 */
export default function CustomersScreen() {
  const gutter = usePageGutter();
  const searchClearance = useSearchClearance();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 300);
  const customers = useCustomerList(search);
  const [pulling, setPulling] = useState(false);
  const list = customers.data ?? [];
  const searching = search.trim().length > 0;

  const refresh = async () => {
    setPulling(true);
    await customers.refetch();
    setPulling(false);
  };

  const open = (customer?: CustomerRow) => {
    haptic.light();
    router.push(
      customer
        ? { pathname: '/manage/customers/edit', params: { customerId: customer.id, name: customer.name ?? '', phone: customer.phone ?? '' } }
        : '/manage/customers/edit',
    );
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Заказчики</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton icon="plus" accessibilityLabel="Новый заказчик" onPress={() => open()} />
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter, { paddingBottom: searchClearance }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        {customers.data && (
          <Text style={[type.footnote, styles.count]}>
            {searching
              ? list.length >= 8
                ? 'Первые 8 совпадений — уточните запрос'
                : `Найдено: ${list.length}`
              : `${list.length} ${plural(list.length, ['заказчик', 'заказчика', 'заказчиков'])}`}
          </Text>
        )}

        {customers.isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : customers.isError && list.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable title="Нет связи" systemImage="wifi.exclamationmark" description={customers.error.message} />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable
              title={searching ? 'Никого не нашли' : 'Заказчиков нет'}
              systemImage="person.crop.rectangle.stack"
              description={searching ? 'Проверьте имя или номер.' : 'Контакты появятся из броней и мероприятий или добавьте их кнопкой «+».'}
            />
          </View>
        ) : (
          <LayoutAnimationConfig skipEntering>
            <View style={styles.list}>
              {list.map((customer) => (
                <Animated.View key={customer.id} entering={FadeIn} exiting={FadeOut} layout={rowLayout}>
                  <CustomerCard customer={customer} onOpen={() => open(customer)} />
                </Animated.View>
              ))}
            </View>
          </LayoutAnimationConfig>
        )}
      </ScrollView>
      <BottomSearch value={query} onChange={setQuery} placeholder="Имя или телефон" />
    </AmbientBackdrop>
  );
}

function CustomerCard({ customer, onOpen }: { customer: CustomerRow; onOpen: () => void }) {
  const phone = customer.phone ? normalizePhone(customer.phone) : null;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={customer.name ?? 'Без имени'}>
      <GlassView isInteractive style={styles.card}>
        <View style={styles.icon}>
          <SymbolView name="person.crop.circle.fill" size={26} tintColor={colors.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={[type.headline, customer.name ? styles.label : styles.tertiary]} numberOfLines={1}>
            {customer.name || 'Без имени'}
          </Text>
          <Text style={[type.subhead, customer.phone ? styles.secondary : styles.tertiary]} numberOfLines={1}>
            {customer.phone || 'Нет телефона'}
          </Text>
        </View>
        {phone && (
          <View style={styles.actions}>
            <RoundAction icon="phone.fill" color="#10B981" label="Позвонить" onPress={() => void Linking.openURL(`tel:+${phone}`)} />
            <RoundAction icon="message.fill" color="#22C55E" label="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${phone}`)} />
            <RoundAction icon="paperplane.fill" color="#0EA5E9" label="Telegram" onPress={() => void Linking.openURL(`tg://resolve?phone=${phone}`)} />
          </View>
        )}
      </GlassView>
    </Pressable>
  );
}

function RoundAction({ icon, color, label, onPress }: { icon: SFSymbol; color: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      hitSlop={4}
      style={({ pressed }) => [styles.round, { backgroundColor: color }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <SymbolView name={icon} size={14} tintColor="white" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tertiary: { color: colors.tertiaryLabel },
  count: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  loading: { paddingTop: 60 },
  empty: { height: 360 },
  list: { gap: space.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 22, borderCurve: 'continuous' },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  actions: { flexDirection: 'row', gap: 6 },
  round: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
