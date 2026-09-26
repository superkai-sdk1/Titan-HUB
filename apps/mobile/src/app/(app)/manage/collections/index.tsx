import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassView } from '@/components/glass';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { Unavailable } from '@/components/unavailable';
import { useCollections, type CollectionListItem } from '@/lib/collections-api';
import { formatMoney, plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { usePageGutter } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';
import { ToolbarButton } from '@/components/toolbar';

/**
 * Сборы клуба: ежемесячный «Фонд клуба» и разовые сборы. Карточка показывает текущий
 * период, сколько собрано и сколько участников уже заплатили.
 */
export default function CollectionsScreen() {
  const gutter = usePageGutter();
  const router = useRouter();
  const collections = useCollections();
  const [pulling, setPulling] = useState(false);
  const list = collections.data?.collections ?? [];

  const refresh = async () => {
    setPulling(true);
    await collections.refetch();
    setPulling(false);
  };

  return (
    <AmbientBackdrop style={styles.screen}>
      <Stack.Title>Сбор средств</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton icon="plus" accessibilityLabel="Новый сбор" onPress={() => router.push('/manage/collections/edit')} />
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, gutter]}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={pulling} onRefresh={refresh} />}>
        {collections.data && (
          <Text style={[type.footnote, styles.caption]}>
            {`Участвуют резиденты, студенты и новички — ${collections.data.eligibleCount} ${plural(collections.data.eligibleCount, ['человек', 'человека', 'человек'])}. Взносы идут мимо кассы.`}
          </Text>
        )}

        {collections.isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : collections.isError && list.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable title="Не удалось загрузить сборы" systemImage="wifi.exclamationmark" description={collections.error.message} />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable title="Пока нет сборов" systemImage="banknote" description="Создайте «Фонд клуба» или разовый сбор кнопкой «+»." />
          </View>
        ) : (
          list.map((item) => (
            <CollectionCard
              key={item.id}
              item={item}
              onPress={() => {
                haptic.selection();
                router.push({ pathname: '/manage/collections/[collectionId]', params: { collectionId: item.id, name: item.name } });
              }}
            />
          ))
        )}
      </ScrollView>
    </AmbientBackdrop>
  );
}

function CollectionCard({ item, onPress }: { item: CollectionListItem; onPress: () => void }) {
  const progress = item.expectedCount > 0 ? Math.min(1, item.paidCount / item.expectedCount) : 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={item.name}>
      <GlassView isInteractive style={styles.card}>
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: item.kind === 'recurring' ? 'rgba(16,185,129,0.16)' : 'rgba(59,130,246,0.16)' }]}>
            <SymbolView name={item.kind === 'recurring' ? 'building.columns.fill' : 'gift.fill'} size={20} tintColor={item.kind === 'recurring' ? '#10B981' : '#3B82F6'} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.headline, styles.label]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.badges}>
              <Badge text={item.kind === 'recurring' ? 'Ежемесячный' : 'Разовый'} color={item.kind === 'recurring' ? '#10B981' : '#3B82F6'} />
              <Badge text={item.isMandatory ? 'Обязательный' : 'Добровольный'} color={item.isMandatory ? '#F59E0B' : '#94A3B8'} />
            </View>
          </View>
          <View style={styles.amount}>
            <Text style={[type.title3, type.amount, styles.label]}>{formatMoney(item.collected, { kopecks: 'auto' })}</Text>
            <Text style={[type.caption1, styles.secondary]}>собрано</Text>
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={[type.footnote, styles.secondary]}>
          {`${item.period?.label ?? 'Период ещё не открыт'} · оплатили ${item.paidCount} из ${item.expectedCount}${item.defaultAmount > 0 ? ` · взнос ${formatMoney(item.defaultAmount, { kopecks: 'auto' })}` : ''}`}
        </Text>
        {item.description && (
          <Text style={[type.footnote, styles.tertiary]} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </GlassView>
    </Pressable>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}24` }]}>
      <Text style={[type.caption2, styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: 140, gap: space.md },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  tertiary: { color: colors.tertiaryLabel },
  caption: { color: colors.secondaryLabel, paddingHorizontal: space.xs },
  loading: { paddingTop: 60 },
  empty: { height: 360 },
  card: { padding: space.lg, gap: space.sm, borderRadius: 22, borderCurve: 'continuous' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 13, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', gap: 6, marginTop: 3 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontWeight: '700' },
  amount: { alignItems: 'flex-end' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#10B981' },
});
