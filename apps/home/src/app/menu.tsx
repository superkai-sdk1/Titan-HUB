// Меню кабинки: категории, карточки с фото, корзина. Заказ уходит персоналу на
// подтверждение; без открытого счёта меню можно только посмотреть.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categoryLook } from '@/components/category-icon';
import { Button, Icon, IconButton, Loader, Tap } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { cartSummary, qtyOf, useCart } from '@/lib/cart';
import { toast, useFlow } from '@/lib/flow';
import { money, num, plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { invalidate, useMenu } from '@/lib/queries';
import { colors, GUTTER, radius, space, type } from '@/lib/theme';
import type { MenuCategory, MenuItem } from '@/lib/types';

const ALL = '__all';
const RAIL_W = 180;
const CART_W = 300;

export default function MenuScreen() {
  const router = useRouter();
  const menu = useMenu();
  const phase = useFlow((s) => s.phase);
  const checkId = phase.kind === 'session' ? phase.checkId : null;
  // Ширина именно области экрана (без панели «Свет и климат»): по ней раскладка.
  const win = useWindowDimensions();
  const [width, setWidth] = useState(win.width);
  // Широко — рейка категорий слева и корзина справа; узко — категории сверху и плашка корзины.
  const wide = width >= 940;
  const [cat, setCat] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState(false);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.items.filter((i) => {
      if (q) return i.name.toLowerCase().includes(q) || (i.searchTags ?? []).some((t) => t.toLowerCase().includes(q));
      return cat === ALL || i.category === cat;
    });
  }, [menu.items, cat, query]);

  const gridWidth = width - GUTTER * 2 - (wide ? RAIL_W + CART_W + GUTTER : 0);
  const columns = Math.max(2, Math.min(5, Math.floor(gridWidth / 210)));
  const catById = (id: string | null) => menu.categories.find((c) => c.id === id);

  if (sent) return <SentView onDone={() => router.back()} />;

  return (
    <View style={styles.screen} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" label="Назад" onPress={() => router.back()} />
        <Text style={type.title}>Меню</Text>
        <View style={styles.search}>
          <Icon name="magnify" size={22} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти блюдо или напиток"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Очистить">
              <Icon name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!checkId ? (
        <View style={styles.notice}>
          <Icon name="information-outline" size={20} color={colors.cyan} />
          <Text style={styles.noticeText}>Заказать можно, когда администратор откроет счёт кабинки. Пока — посмотрите, что у нас есть.</Text>
        </View>
      ) : null}

      <View style={[styles.body, !wide && { flexDirection: 'column' }]}>
        <Categories categories={menu.categories} value={cat} onChange={(c) => { setCat(c); setQuery(''); }} vertical={wide} />
        <View style={{ flex: 1 }}>
          {menu.isLoading ? (
            <Loader label="Загружаем меню…" />
          ) : menu.isError ? (
            <View style={styles.empty}>
              <Text style={type.body}>Не удалось загрузить меню</Text>
              <Button title="Повторить" variant="secondary" icon="refresh" onPress={() => void menu.refetch()} />
            </View>
          ) : (
            <FlatList
              key={columns}
              data={items}
              numColumns={columns}
              keyExtractor={(i) => i.id}
              columnWrapperStyle={{ gap: space.lg }}
              contentContainerStyle={styles.grid}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => <ItemCard item={item} category={catById(item.category)} canOrder={!!checkId} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Icon name="magnify" size={40} color={colors.textMuted} />
                  <Text style={[type.body, { color: colors.textSecondary }]}>Ничего не нашлось</Text>
                </View>
              }
            />
          )}
        </View>
        {wide && checkId ? <CartPanel checkId={checkId} onSent={() => setSent(true)} /> : null}
      </View>
      {!wide && checkId ? <CartBar checkId={checkId} onSent={() => setSent(true)} /> : null}
    </View>
  );
}

function Categories({ categories, value, onChange, vertical }: { categories: MenuCategory[]; value: string; onChange: (id: string) => void; vertical: boolean }) {
  const all = [{ id: ALL, name: 'Все', icon: 'other', color: '#8B5CF6' } as MenuCategory, ...categories];
  return (
    <ScrollView
      horizontal={!vertical}
      style={vertical ? styles.rail : styles.chipsScroll}
      contentContainerStyle={vertical ? styles.railContent : styles.chips}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {all.map((c) => {
        const active = value === c.id;
        const look = c.id === ALL ? { icon: 'view-grid-outline' as const, color: colors.violet } : categoryLook(c.icon, c.color);
        return (
          <Tap
            key={c.id}
            onPress={() => onChange(c.id)}
            style={[vertical ? styles.railItem : styles.chip, active && { backgroundColor: `${look.color}26`, borderColor: `${look.color}88` }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Icon name={look.icon} size={22} color={active ? look.color : colors.textSecondary} />
            <Text style={[styles.catText, active && { color: colors.text }]} numberOfLines={vertical ? 2 : 1}>{c.name}</Text>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

function ItemCard({ item, category, canOrder }: { item: MenuItem; category?: MenuCategory; canOrder: boolean }) {
  const qty = useCart((s) => qtyOf(s.lines, item.id));
  const add = useCart((s) => s.add);
  const remove = useCart((s) => s.remove);
  const look = categoryLook(category?.icon, category?.color);

  return (
    <Tap
      style={[styles.card, qty > 0 && { borderColor: `${look.color}aa`, backgroundColor: `${look.color}14` }]}
      onPress={() => { if (canOrder) add(item); }}
      scaleTo={canOrder ? 0.96 : 1}
      hapticOnPress={canOrder}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${money(num(item.price))}`}
    >
      <View style={[styles.cardAccent, { backgroundColor: look.color }]} />
      <View style={styles.cardTop}>
        <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
        {qty > 0 ? (
          <Animated.View entering={ZoomIn} style={[styles.qtyBadge, { backgroundColor: look.color }]}>
            <Text style={styles.qtyBadgeText}>{qty}</Text>
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.cardFoot}>
        <Text style={styles.cardPrice}>{money(num(item.price))}</Text>
        {canOrder ? (
          qty > 0 ? (
            <View style={styles.stepper}>
              <IconButton icon="minus" label="Убрать" size={44} onPress={() => remove(item.id)} />
              <IconButton icon="plus" label="Добавить" size={44} tone={look.color} onPress={() => add(item)} />
            </View>
          ) : (
            <View style={[styles.addDot, { backgroundColor: look.color }]}>
              <Icon name="plus" size={26} color="#fff" />
            </View>
          )
        ) : null}
      </View>
    </Tap>
  );
}

function useSendOrder(checkId: string, onSent: () => void) {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!lines.length || busy) return;
    setBusy(true);
    try {
      await api.post(`/pos/checks/${checkId}/orders`, {
        items: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })),
      });
      haptic.success();
      clear();
      void invalidate('check', checkId);
      onSent();
    } catch (e) {
      haptic.error();
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { send, busy };
}

function CartLines() {
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const remove = useCart((s) => s.remove);
  return (
    <>
      {lines.map((l) => (
        <Animated.View key={l.item.id} layout={LinearTransition} entering={FadeInDown} style={styles.line}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.lineName} numberOfLines={2}>{l.item.name}</Text>
            <Text style={styles.linePrice}>{money(num(l.item.price) * l.quantity)}</Text>
          </View>
          <IconButton icon="minus" label="Убрать" size={38} onPress={() => remove(l.item.id)} />
          <Text style={styles.lineQty}>{l.quantity}</Text>
          <IconButton icon="plus" label="Добавить" size={38} tone={colors.violetLight} onPress={() => add(l.item)} />
        </Animated.View>
      ))}
    </>
  );
}

function CartPanel({ checkId, onSent }: { checkId: string; onSent: () => void }) {
  const lines = useCart((s) => s.lines);
  const { count, total } = cartSummary(lines);
  const { send, busy } = useSendOrder(checkId, onSent);
  return (
    <View style={styles.cartPanel}>
      <Text style={type.heading}>Ваш заказ</Text>
      {lines.length ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space.sm }}>
          <CartLines />
        </ScrollView>
      ) : (
        <View style={styles.cartEmpty}>
          <Icon name="cart-outline" size={44} color={colors.textMuted} />
          <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center' }]}>Коснитесь блюда, чтобы добавить его в заказ</Text>
        </View>
      )}
      <View style={styles.cartTotal}>
        <Text style={type.caption}>{count ? `${count} ${plural(count, 'позиция', 'позиции', 'позиций')}` : 'Пусто'}</Text>
        <Text style={styles.cartSum}>{money(total)}</Text>
      </View>
      <Button title="Заказать" icon="send" variant="brand" size="xl" onPress={() => void send()} loading={busy} disabled={!lines.length} />
    </View>
  );
}

function CartBar({ checkId, onSent }: { checkId: string; onSent: () => void }) {
  const lines = useCart((s) => s.lines);
  const { count, total } = cartSummary(lines);
  const [open, setOpen] = useState(false);
  const { send, busy } = useSendOrder(checkId, () => { setOpen(false); onSent(); });
  const insets = useSafeAreaInsets();
  if (!count) return null;
  return (
    <>
      <Animated.View entering={FadeInDown} style={[styles.cartBar, { marginBottom: GUTTER + insets.bottom }]}>
        <Tap style={styles.cartBarButton} onPress={() => setOpen(true)} accessibilityRole="button">
          <Icon name="cart-outline" size={26} color="#fff" />
          <Text style={styles.cartBarText}>{count} {plural(count, 'позиция', 'позиции', 'позиций')} · {money(total)}</Text>
          <Text style={styles.cartBarCta}>Оформить</Text>
        </Tap>
      </Animated.View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={type.heading}>Ваш заказ</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space.sm }}>
              <CartLines />
            </ScrollView>
            <View style={styles.cartTotal}>
              <Text style={type.caption}>Итого</Text>
              <Text style={styles.cartSum}>{money(total)}</Text>
            </View>
            <Button title="Заказать" icon="send" variant="brand" size="xl" onPress={() => void send()} loading={busy} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function SentView({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <Animated.View entering={FadeIn} style={styles.sent}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.sentIcon}>
        <Icon name="check-bold" size={60} color={colors.greenDeep} />
      </Animated.View>
      <Text style={[type.hero, { textAlign: 'center' }]}>Заказ отправлен!</Text>
      <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center', maxWidth: 460 }]}>
        Администратор подтвердит его в течение пары минут — статус видно на экране счёта.
      </Text>
      <Button title="К счёту" icon="arrow-left" variant="secondary" onPress={onDone} style={{ marginTop: space.lg }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.md },
  search: {
    flex: 1, maxWidth: 460, marginLeft: 'auto', height: 52, borderRadius: 26, paddingHorizontal: space.lg,
    flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: GUTTER, marginBottom: space.md,
    padding: space.md, paddingHorizontal: space.lg, borderRadius: radius.tile, backgroundColor: colors.cyanTint, borderWidth: 1, borderColor: 'rgba(76,215,246,0.25)',
  },
  noticeText: { flex: 1, color: colors.textBody, fontSize: 15 },
  body: { flex: 1, flexDirection: 'row' },
  rail: { width: RAIL_W, flexGrow: 0 },
  railContent: { gap: space.sm, paddingLeft: GUTTER, paddingRight: space.sm, paddingBottom: GUTTER },
  railItem: {
    minHeight: 64, borderRadius: radius.tile, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md,
    borderWidth: 1, borderColor: 'transparent',
  },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: space.sm, paddingHorizontal: GUTTER, paddingBottom: space.md },
  chip: {
    height: 52, borderRadius: 26, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.border,
  },
  catText: { fontSize: 16, fontWeight: '700', color: colors.textSecondary, flexShrink: 1 },
  grid: { gap: space.lg, paddingHorizontal: GUTTER, paddingBottom: 120 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: 64 },
  card: {
    flex: 1, minHeight: 132, borderRadius: radius.card, padding: space.lg, paddingLeft: space.lg + 6, overflow: 'hidden',
    justifyContent: 'space-between', gap: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  cardAccent: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  qtyBadge: { minWidth: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  qtyBadgeText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  cardName: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  cardPrice: { fontSize: 19, fontWeight: '900', color: colors.lavender, fontVariant: ['tabular-nums'] },
  stepper: { flexDirection: 'row', gap: 6 },
  addDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cartPanel: {
    width: CART_W, marginRight: GUTTER, marginBottom: GUTTER, padding: space.xl, gap: space.md, borderRadius: radius.panel,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  cartEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineName: { fontSize: 15, fontWeight: '700', color: colors.text },
  linePrice: { fontSize: 14, color: colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  lineQty: { width: 26, textAlign: 'center', fontSize: 17, fontWeight: '900', color: colors.text },
  cartTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  cartSum: { fontSize: 28, fontWeight: '900', color: colors.text, fontVariant: ['tabular-nums'] },
  cartBar: { position: 'absolute', left: GUTTER, right: GUTTER, bottom: 0 },
  cartBarButton: {
    height: 72, borderRadius: 36, paddingHorizontal: space.xxl, flexDirection: 'row', alignItems: 'center', gap: space.md,
    experimental_backgroundImage: 'linear-gradient(135deg, #8B5CF6 0%, #4cd7f6 100%)', boxShadow: '0 12px 40px rgba(139,92,246,0.5)',
  },
  cartBarText: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
  cartBarCta: { color: '#fff', fontSize: 18, fontWeight: '900' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%', maxWidth: 720, padding: space.xxl, gap: space.md, borderTopLeftRadius: 32, borderTopRightRadius: 32,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  sent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: GUTTER },
  sentIcon: {
    width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.14)', borderWidth: 2, borderColor: 'rgba(16,185,129,0.5)', boxShadow: '0 0 60px rgba(16,185,129,0.35)',
  },
});
