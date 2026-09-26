import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AppRefreshControl } from '@/components/refresh-control';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { GlassCard, sheetStyles } from '@/components/new-check-parts';
import { saveEventRate, SPACE_LOOK, useEveningTypesAdmin, useSpacesAdmin, useTariffsAdmin } from '@/lib/catalog-api';
import { useEventRates } from '@/lib/events-api';
import { formatMoney, toNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { SPACE_TYPE_LABEL } from '@/lib/pos-api';
import { queryClient } from '@/lib/query';
import { useClubKey } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { parseAmount } from '@/lib/shift-api';
import { colors, space, type } from '@/lib/theme';
import { promptText } from '@/lib/dialog';
import { ToolbarButton } from '@/components/toolbar';

type Tab = 'tariffs' | 'evenings' | 'rental' | 'events';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Тарифы и аренда: статусы и тарифы (сумма за вечер), типы вечеров, зоны с почасовой
 * ставкой и тарифы мероприятий. Менять может только владелец, сотрудник видит справочник.
 */
export default function PricingScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const club = useClubKey();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const tariffs = useTariffsAdmin();
  const evenings = useEveningTypesAdmin();
  const spaces = useSpacesAdmin();
  const rates = useEventRates();
  const [tab, setTab] = useState<Tab>('tariffs');
  const [pulling, setPulling] = useState(false);

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([queryClient.refetchQueries({ queryKey: [club, 'pricing'], type: 'active' }), spaces.refetch()]);
    setPulling(false);
  };

  const add = () => {
    haptic.light();
    if (tab === 'tariffs') router.push('/manage/pricing/tariff');
    else if (tab === 'evenings') router.push('/manage/pricing/evening');
    else if (tab === 'rental') router.push('/manage/pricing/space');
    else addEventRate();
  };

  const editRate = (hours: number, price: number) =>
    promptText(
      `${hours} ч`,
      'Цена за весь период — основа чека мероприятия с почасовой оплатой',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сохранить',
          onPress: (value?: string) => {
            const amount = parseAmount(value ?? '');
            if (amount === null) return Alert.alert('Введите сумму');
            saveEventRate(hours, amount)
              .then(() => haptic.success())
              .catch((error: unknown) => Alert.alert('Тариф не сохранён', errorText(error)));
          },
        },
      ],
      'plain-text',
      String(price),
      'decimal-pad',
    );

  const addEventRate = () =>
    promptText('Сколько часов?', 'Например, 7', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Дальше',
        onPress: (value?: string) => {
          const hours = Math.round(Number(value));
          if (!Number.isInteger(hours) || hours < 1 || hours > 24) return Alert.alert('От 1 до 24 часов');
          editRate(hours, 0);
        },
      },
    ], 'plain-text', '', 'number-pad');

  const tariffList = (tariffs.data ?? []).filter((t) => t.isActive !== false);

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Тарифы и аренда</Stack.Title>
      {isOwner && (
        <Stack.Toolbar placement="right">
          <ToolbarButton icon="plus" accessibilityLabel="Добавить" onPress={add} />
        </Stack.Toolbar>
      )}

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<AppRefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        <Host matchContents={{ vertical: true }} style={styles.segment}>
          <Picker
            selection={tab}
            onSelectionChange={(value) => {
              haptic.selection();
              setTab(value as Tab);
            }}
            modifiers={[pickerStyle('segmented')]}>
            <SwiftText modifiers={[tag('tariffs')]}>Тарифы</SwiftText>
            <SwiftText modifiers={[tag('evenings')]}>Вечера</SwiftText>
            <SwiftText modifiers={[tag('rental')]}>Аренда</SwiftText>
            <SwiftText modifiers={[tag('events')]}>События</SwiftText>
          </Picker>
        </Host>

        <LayoutAnimationConfig skipEntering>
          <Animated.View key={tab} entering={FadeIn.duration(180)} style={styles.tab}>
            {tab === 'tariffs' && (
              <>
                <Text style={[type.footnote, styles.caption]}>Статус клиента и тариф — одно и то же: у каждого статуса своя сумма за вечер. Можно добавить и обычные тарифы, например «Одна игра».</Text>
                <ListCard loading={tariffs.isLoading} empty="Тарифов нет">
                  {tariffList.map((t) => (
                    <Row
                      key={t.id}
                      icon={t.key ? 'person.crop.circle.badge.checkmark' : 'ticket'}
                      color={/^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#8B5CF6'}
                      title={t.name}
                      subtitle={t.key ? 'Статус клиента · сумма за вечер' : 'Тариф'}
                      value={formatMoney(toNumber(t.price))}
                      onPress={isOwner ? () => router.push({ pathname: '/manage/pricing/tariff', params: { tariffId: t.id } }) : undefined}
                    />
                  ))}
                </ListCard>
              </>
            )}

            {tab === 'evenings' && (
              <>
                <Text style={[type.footnote, styles.caption]}>Тип вечера выбирают при открытии смены — по нему считаются игровые вечера в аналитике.</Text>
                <ListCard loading={evenings.isLoading} empty="Типов вечеров нет">
                  {(evenings.data ?? []).map((e) => (
                    <Row
                      key={e.key}
                      icon="moon.stars"
                      color={e.color && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#10B981'}
                      title={e.label}
                      subtitle={e.isSystem || e.key === 'none' ? 'Системный' : undefined}
                      onPress={isOwner ? () => router.push({ pathname: '/manage/pricing/evening', params: { key: e.key } }) : undefined}
                    />
                  ))}
                </ListCard>
              </>
            )}

            {tab === 'rental' && (
              <>
                <Text style={[type.footnote, styles.caption]}>Зоны аренды с почасовой ставкой. К зоне привязывается планшет кабинки.</Text>
                <ListCard loading={spaces.isLoading} empty="Зон нет">
                  {(spaces.data ?? []).map((s) => (
                    <Row
                      key={s.id}
                      icon={SPACE_LOOK[s.type]?.symbol ?? 'square.grid.2x2'}
                      color={SPACE_LOOK[s.type]?.color ?? '#94A3B8'}
                      title={s.name}
                      subtitle={[SPACE_TYPE_LABEL[s.type], s.capacity ? `${s.capacity} чел.` : null, s.isActive ? null : 'выключена'].filter(Boolean).join(' · ')}
                      value={`${formatMoney(toNumber(s.hourlyRate))}/ч`}
                      dim={!s.isActive}
                      onPress={isOwner ? () => router.push({ pathname: '/manage/pricing/space', params: { spaceId: s.id } }) : undefined}
                    />
                  ))}
                </ListCard>
              </>
            )}

            {tab === 'events' && (
              <>
                <Text style={[type.footnote, styles.caption]}>Цена за весь период по числу часов — основа чека мероприятия с почасовой оплатой.</Text>
                <ListCard loading={rates.isLoading} empty="Почасовых тарифов нет">
                  {(rates.data ?? []).map((r) => (
                    <Row
                      key={r.hours}
                      icon="clock"
                      color="#A78BFA"
                      title={`${r.hours} ч`}
                      subtitle={r.hours > 1 ? `${formatMoney(Math.round(toNumber(r.price) / r.hours))} в час` : undefined}
                      value={formatMoney(toNumber(r.price))}
                      onPress={isOwner ? () => editRate(r.hours, toNumber(r.price)) : undefined}
                    />
                  ))}
                </ListCard>
              </>
            )}
          </Animated.View>
        </LayoutAnimationConfig>
        {!isOwner && <Text style={[type.footnote, styles.caption, styles.centered]}>Изменять справочник может только владелец.</Text>}
      </ScrollView>
    </AmbientBackdrop>
  );
}

function ListCard({ loading, empty, children }: { loading: boolean; empty: string; children: React.ReactNode[] }) {
  if (loading) return <ActivityIndicator style={styles.loading} />;
  if (children.length === 0) return <Text style={[type.subhead, styles.secondary, styles.centered, styles.loading]}>{empty}</Text>;
  return <GlassCard>{children.map((child, index) => <View key={index}>{index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}{child}</View>)}</GlassCard>;
}

function Row({ icon, color, title, subtitle, value, dim, onPress }: { icon: SFSymbol; color: string; title: string; subtitle?: string; value?: string; dim?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress?.();
      }}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, dim && styles.dim, pressed && sheetStyles.pressedRow]}
      accessibilityRole={onPress ? 'button' : undefined}>
      <View style={[styles.icon, { backgroundColor: color }]}>
        <SymbolView name={icon} size={16} weight="semibold" tintColor="white" />
      </View>
      <View style={styles.flex}>
        <Text style={[type.body, styles.label]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {value && <Text style={[type.body, type.amount, styles.label]}>{value}</Text>}
      {onPress && <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center' },
  caption: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  segment: { alignSelf: 'stretch' },
  tab: { gap: space.sm },
  loading: { paddingVertical: space.xxl },
  separator: { marginLeft: 62 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  dim: { opacity: 0.55 },
  icon: { width: 34, height: 34, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
});
