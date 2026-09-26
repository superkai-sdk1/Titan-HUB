import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import { Link, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { BirthdaysBanner } from '@/components/birthdays-banner';
import { CheckCard, type CheckCardModel } from '@/components/check-card';
import { CheckPanel } from '@/components/check-panel';
import { PrecheckCard } from '@/components/precheck-card';
import { Unavailable } from '@/components/unavailable';
import { cardLines, checkTitle, checkTotals, openedLabel } from '@/lib/checks';
import { createAccessoryScrollHandler } from '@/lib/chrome';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { SPLIT_MIN_WIDTH, useSplitLayout } from '@/lib/layout';
import { checkNeedsAttention } from '@/lib/notifications';
import { usePosSelection } from '@/lib/pos-selection';
import { createCheckErrorMessage } from '@/lib/new-check';
import { chooseAction } from '@/lib/dialog';
import { openPrecheck, usePrechecks, type Precheck } from '@/lib/pos-api';
import { useChecks, useNotifications } from '@/lib/queries';
import { colors, space, type } from '@/lib/theme';
import type { AppNotification, CheckListItem } from '@/lib/types';
import { useNow } from '@/lib/use-now';

/** systemChromeMaterial — тинт UIKit: на Android expo-blur его не знает и подложка выходит пустой. */
const BLUR_TINT = Platform.OS === 'ios' ? 'systemChromeMaterial' : 'dark';

const LONG_STAY_MIN = 480;
const IS_PAD = Platform.OS === 'ios' && Platform.isPad;
/** С какой ширины окна касса делится на сетку и открытый чек (iPad, Split View). */
const GRID_PADDING = space.md - 2;
/** Высота плашки смены над таб-баром (bottom accessory iOS 26). */
const ACCESSORY_HEIGHT = 72;

/** Новый чек появляется из точки, закрытый — растворяется; соседи переезжают пружиной. */
const cardEntering: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.86 }] },
    animations: {
      opacity: withTiming(1, { duration: 220 }),
      transform: [{ scale: withSpring(1, { damping: 17, stiffness: 190 }) }],
    },
  };
};

const cardExiting: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 220 }),
      transform: [{ scale: withTiming(0.86, { duration: 220 }) }],
    },
  };
};

const cardLayout = LinearTransition.springify().damping(22).stiffness(200);

type TransitionEvents = {
  addListener: (type: 'transitionStart' | 'transitionEnd', callback: (e: { data: { closing: boolean } }) => void) => () => void;
};

function toModel(check: CheckListItem, notifications: AppNotification[] | undefined, now: number): CheckCardModel {
  const { lines, moreCount } = cardLines(check);
  const minutes = Math.floor((now - new Date(check.createdAt).getTime()) / 60_000);
  return {
    id: check.id,
    title: checkTitle(check),
    photoUrl: check.guestPhotoUrl,
    subtitle: check.spaceName,
    lines,
    moreCount,
    total: checkTotals(check, now).total,
    openedLabel: openedLabel(check, now),
    longStay: minutes >= LONG_STAY_MIN,
    hasRental: check.hasRental,
    attention: checkNeedsAttention(notifications, check),
  };
}

export default function PosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const checks = useChecks();
  const notifications = useNotifications();
  const prechecks = usePrechecks();
  const [openingPrecheck, setOpeningPrecheck] = useState<string | null>(null);
  const now = useNow(30_000);
  const [listWidth, setListWidth] = useState(0);
  // Ширина самого экрана, а не окна: на iPad пользователь может раскрыть боковую панель вкладок.
  const [screenWidth, setScreenWidth] = useState(0);
  // Индикатор — только когда кассир сам потянул список. Фоновые обновления (опрос, SSE)
  // идут молча: иначе системный спиннер сдвигает контент и касса дёргается.
  const [pulling, setPulling] = useState(false);
  const selectedId = usePosSelection((s) => s.selectedCheckId);
  const setSelectedId = usePosSelection((s) => s.select);
  const onAccessoryScroll = useRef(createAccessoryScrollHandler()).current;
  const topBlur = useSharedValue(0);

  const wide = screenWidth === 0 ? window.width : screenWidth;
  const split = useSplitLayout() && wide >= SPLIT_MIN_WIDTH;
  // Как в веб-кассе: узкая колонка не должна ломать карточки (iPad Slide Over, боковая панель).
  const columns = listWidth >= 980 ? 4 : listWidth >= 620 ? 3 : listWidth >= 280 ? 2 : 1;
  const cellWidth = Math.floor((listWidth - GRID_PADDING * 2) / columns);
  const unreadCount = (notifications.data ?? []).filter((n) => !n.isRead).length;
  const count = checks.data?.length ?? 0;

  const liveData = useMemo(
    () => (checks.data ?? []).map((c) => toModel(c, notifications.data, now)),
    [checks.data, notifications.data, now],
  );

  // Пока поверх кассы открыт чек, сетку не меняем: при закрытии чек должен свернуться
  // зумом обратно в свою карточку. Оплаченная карточка растворяется уже после возврата.
  const navigation = useNavigation() as unknown as TransitionEvents;
  const [frozen, setFrozen] = useState<CheckCardModel[] | null>(null);
  const freeze = useEffectEvent(() => setFrozen(liveData));
  const release = useEffectEvent(() => setFrozen(null));
  useEffect(() => {
    const offStart = navigation.addListener('transitionStart', (e) => {
      if (e.data.closing) freeze();
    });
    const offEnd = navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) release();
    });
    return () => {
      offStart();
      offEnd();
    };
  }, [navigation]);
  const data = frozen ?? liveData;

  const topBlurStyle = useAnimatedStyle(() => ({ opacity: topBlur.value }));

  const refresh = async () => {
    setPulling(true);
    await Promise.allSettled([checks.refetch(), notifications.refetch(), prechecks.refetch()]);
    setPulling(false);
  };

  const onOpenPrecheck = async (precheck: Precheck) => {
    setOpeningPrecheck(precheck.playerId);
    try {
      await openPrecheck(precheck);
    } catch (error) {
      haptic.error();
      Alert.alert('Чек не открыт', createCheckErrorMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setOpeningPrecheck(null);
    }
  };

  const precheckList = prechecks.data ?? [];

  const header = (
    <View style={styles.header}>
      <View style={styles.titles}>
        <Text style={[type.largeTitle, styles.title]}>Касса</Text>
        <Text style={[type.subhead, styles.subtitle]}>
          {checks.isLoading ? 'Загружаем чеки…' : count === 0 ? 'Открытых чеков нет' : `${count} ${plural(count, ['открытый чек', 'открытых чека', 'открытых чеков'])}`}
        </Text>
      </View>
      {/* Соседние стеклянные кнопки — в контейнере: при сближении система сливает их, как в iOS 26. */}
      <GlassContainer spacing={18} style={styles.headerActions}>
        <GlassView isInteractive style={styles.bell}>
          <Pressable
            style={styles.bellPress}
            onPress={() => {
              haptic.light();
              router.push('/pos/refunds');
            }}
            accessibilityRole="button"
            accessibilityLabel="Возвраты">
            <SymbolView name="arrow.uturn.backward" size={19} weight="medium" tintColor={colors.label} />
          </Pressable>
        </GlassView>
        <GlassView isInteractive style={styles.bell}>
          <Pressable
            style={styles.bellPress}
            onPress={() => {
              haptic.light();
              router.push('/notifications');
            }}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Уведомления, новых: ${unreadCount}` : 'Уведомления'}>
            <SymbolView name={unreadCount > 0 ? 'bell.badge.fill' : 'bell'} size={21} tintColor={unreadCount > 0 ? colors.accent : colors.label} />
          </Pressable>
        </GlassView>
      </GlassContainer>
    </View>
  );

  const renderCard = (item: CheckCardModel) => {
    if (split) {
      return (
        <View style={[styles.fill, item.id === selectedId && styles.selected]}>
          <CheckCard
            model={item}
            onPress={() => {
              haptic.selection();
              setSelectedId(item.id);
            }}
          />
        </View>
      );
    }
    if (Platform.OS === 'android') {
      // Link.Preview и Link.Menu — жесты iOS: на Android долгое нажатие ничего не давало.
      // Те же быстрые действия — списком по долгому нажатию.
      return (
        <CheckCard
          model={item}
          onPress={() => {
            haptic.selection();
            router.push({ pathname: '/pos/[checkId]', params: { checkId: item.id } });
          }}
          delayLongPress={350}
          onLongPress={() => {
            haptic.medium();
            chooseAction(item.title, undefined, [
              { text: 'Добавить позицию', onPress: () => router.push({ pathname: '/pos/menu', params: { checkId: item.id } }) },
              { text: 'Оплатить', onPress: () => router.push({ pathname: '/pay', params: { checkId: item.id } }) },
              { text: 'Чат с кабинкой', onPress: () => router.push({ pathname: '/pos/chat', params: { checkId: item.id } }) },
              { text: 'Отмена', style: 'cancel' },
            ]);
          }}
        />
      );
    }
    return (
      <Link href={{ pathname: '/pos/[checkId]', params: { checkId: item.id } }} asChild>
        {/* Чек раскрывается из карточки и сворачивается обратно в неё (зум iOS 18+). */}
        <Link.Trigger withAppleZoom>
          <CheckCard model={item} />
        </Link.Trigger>
        <Link.Preview />
        <Link.Menu>
          <Link.MenuAction icon="bubble.left" onPress={() => router.push({ pathname: '/pos/chat', params: { checkId: item.id } })}>
            Чат с кабинкой
          </Link.MenuAction>
          <Link.MenuAction icon="plus.circle" onPress={() => router.push({ pathname: '/pos/menu', params: { checkId: item.id } })}>
            Добавить позицию
          </Link.MenuAction>
          <Link.MenuAction icon="creditcard" onPress={() => router.push({ pathname: '/pay', params: { checkId: item.id } })}>
            Оплатить
          </Link.MenuAction>
        </Link.Menu>
      </Link>
    );
  };

  const list = (
    <View style={styles.flex} onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}>
      <Animated.ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingLeft: GRID_PADDING + insets.left, paddingRight: GRID_PADDING + insets.right }]}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          onAccessoryScroll(y);
          topBlur.set(withTiming(y > 8 ? 1 : 0, { duration: 160 }));
        }}
        refreshControl={
          <RefreshControl tintColor={colors.accent} progressViewOffset={insets.top} refreshing={pulling} onRefresh={refresh} />
        }>
        {header}

        <BirthdaysBanner />

        {checks.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : data.length === 0 && precheckList.length === 0 ? (
          <View style={styles.empty}>
            <Unavailable
              title={checks.isError ? 'Нет связи с кассой' : 'Нет открытых чеков'}
              systemImage={checks.isError ? 'wifi.exclamationmark' : 'rublesign.circle'}
              description={
                checks.isError ? checks.error.message : IS_PAD ? 'Новый чек — кнопка в плашке смены внизу.' : 'Новый чек — кнопка «Новый» внизу.'
              }
            />
          </View>
        ) : null}

        {/* Первую загрузку не анимируем; дальше новые и закрытые чеки появляются и растворяются. */}
        {listWidth > 0 && !checks.isLoading && (
          <LayoutAnimationConfig skipEntering>
            <View style={styles.grid}>
              {data.map((item) => (
                <Animated.View
                  key={item.id}
                  layout={cardLayout}
                  entering={cardEntering}
                  exiting={cardExiting}
                  style={[styles.cell, { width: cellWidth }]}>
                  {renderCard(item)}
                </Animated.View>
              ))}
              {precheckList.map((precheck) => (
                <Animated.View
                  key={`pre-${precheck.playerId}`}
                  layout={cardLayout}
                  entering={cardEntering}
                  exiting={cardExiting}
                  style={[styles.cell, { width: cellWidth }]}>
                  <PrecheckCard
                    precheck={precheck}
                    busy={openingPrecheck === precheck.playerId}
                    onOpen={() => void onOpenPrecheck(precheck)}
                  />
                </Animated.View>
              ))}
            </View>
          </LayoutAnimationConfig>
        )}
      </Animated.ScrollView>

      {/* Размытие под статус-баром, когда карточки уезжают под него. */}
      <Animated.View pointerEvents="none" style={[styles.topBlur, { height: insets.top }, topBlurStyle]}>
        <BlurView intensity={80} tint={BLUR_TINT} style={styles.blurFill} />
      </Animated.View>
    </View>
  );

  if (!split) {
    return (
      <AmbientBackdrop style={styles.screen} onLayout={(e) => setScreenWidth(e.nativeEvent.layout.width)}>
        {list}
      </AmbientBackdrop>
    );
  }

  const selectedExists = !!selectedId && (checks.data ?? []).some((c) => c.id === selectedId);
  // Под панелью парит плашка смены (bottom accessory). Если система не учла её в safe area,
  // добавляем высоту плашки сами — иначе «Добавить» и «Оплатить» оказываются под ней.
  const panelBottom = (insets.bottom >= 60 ? insets.bottom : insets.bottom + ACCESSORY_HEIGHT) + space.md;

  return (
    <AmbientBackdrop style={[styles.screen, styles.splitRow]} onLayout={(e) => setScreenWidth(e.nativeEvent.layout.width)}>
      {list}
      <View
        style={[
          styles.panelWrap,
          { paddingTop: insets.top + space.sm, paddingRight: space.md + insets.right, paddingBottom: panelBottom, width: Math.min(480, wide * 0.42) },
        ]}>
        <CheckPanel checkId={selectedExists ? selectedId : null} />
      </View>
    </AmbientBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBackground },
  flex: { flex: 1 },
  fill: { flex: 1 },
  splitRow: { flexDirection: 'row' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: 6,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  titles: { flex: 1 },
  title: { color: colors.label },
  subtitle: { color: colors.secondaryLabel, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bell: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', marginBottom: 4 },
  bellPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: GRID_PADDING, paddingBottom: 140 },
  // Карточки одного ряда тянутся до самой высокой — сетка ровная.
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  cell: { padding: 6 },
  selected: { borderRadius: 24, borderWidth: 2, borderColor: colors.accent, margin: -2 },
  center: { paddingTop: 120, alignItems: 'center' },
  empty: { height: 420 },
  topBlur: { position: 'absolute', top: 0, left: 0, right: 0 },
  blurFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  panelWrap: { paddingRight: space.md, paddingBottom: space.md },
});
