import { Dimensions, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from './theme';

const IS_PAD = Platform.OS === 'ios' && Platform.isPad;

/**
 * Планшет — для сплита кассы. iPad, а на Android — устройство с короткой стороной
 * экрана от 600 dp (порог «sw600dp», которым Android сам отличает планшеты). Раньше
 * критерий был только `Platform.isPad`, и на Android-планшете касса оставалась телефонной.
 */
const IS_TABLET =
  IS_PAD || (Platform.OS === 'android' && Math.min(Dimensions.get('screen').width, Dimensions.get('screen').height) >= 600);

/**
 * Ширина читаемой колонки. На iPad и в ландшафте строки во всю ширину экрана
 * выглядят разорванными (подпись слева, значение в полуметре справа) — контент
 * держим колонкой по центру, как в веб-кассе.
 */
export const MAX_CONTENT_WIDTH = 760;

/**
 * Боковые отступы прокручиваемого экрана: колонка по центру на широких дисплеях
 * и обход «чёлки» в ландшафте (UIScrollView сам добавляет safe area только по оси
 * прокрутки, то есть сверху и снизу).
 *
 * Возвращает paddingLeft/paddingRight — они приоритетнее paddingHorizontal в стилях,
 * поэтому достаточно добавить объект в конец `contentContainerStyle`.
 */
export function usePageGutter(): { paddingLeft: number; paddingRight: number; paddingBottom?: number } {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const column = Math.max(space.lg, Math.round((width - MAX_CONTENT_WIDTH) / 2));
  return {
    paddingLeft: Math.max(column, insets.left + space.lg),
    paddingRight: Math.max(column, insets.right + space.lg),
    // На iPad вкладки живут сверху (или в боковой панели), и запас под плавающий
    // таб-бар iPhone превращается в дыру в конце экрана.
    ...(IS_PAD ? { paddingBottom: insets.bottom + space.xxxl } : {}),
  };
}

/** С какой ширины окна касса показывает правую панель чека. */
export const SPLIT_MIN_WIDTH = 700;


/**
 * Сплит кассы: список чеков слева, открытый чек в панели справа.
 *
 * Только планшет и только когда окно действительно широкое — в Split View iPad окно бывает
 * с телефон, а на телефоне в ландшафте панель отнимает половину и без того низкого экрана.
 * Решение общее для кассы и для переходов после создания чека и оплаты — иначе чек
 * открывался бы в панели, а закрывался как полный экран.
 */
export function useSplitLayout(): boolean {
  const { width } = useWindowDimensions();
  return IS_TABLET && width >= SPLIT_MIN_WIDTH;
}

/** То же решение вне рендера — для навигации из обработчиков. */
export function isSplitLayout(): boolean {
  return IS_TABLET && Dimensions.get('window').width >= SPLIT_MIN_WIDTH;
}

/**
 * Скрытие клавиатуры прокруткой. `interactive` (клавиатура уходит вслед за пальцем)
 * есть только на iOS — на Android это значение игнорируется, и клавиатура не пряталась
 * вовсе. Там ближайший аналог — `on-drag`.
 */
export const KEYBOARD_DISMISS = Platform.OS === 'ios' ? 'interactive' : 'on-drag';
