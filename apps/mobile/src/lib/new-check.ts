import type { useRouter } from 'expo-router';
import {  } from 'react-native';

import { haptic } from './haptics';
import { usePosSelection } from './pos-selection';
import { isSplitLayout } from './layout';
import { queryClient } from './query';
import { useSession } from './session';
import type { CheckRow } from './types';


/** Чек создан: обновить кассу, закрыть шторку и открыть чек (на iPad — в правой панели). */
export function openCreatedCheck(router: ReturnType<typeof useRouter>, check: CheckRow) {
  const host = useSession.getState().club?.host ?? 'none';
  void queryClient.invalidateQueries({ queryKey: [host, 'pos', 'checks'] });
  void queryClient.invalidateQueries({ queryKey: [host, 'pos', 'shift-summary'] });
  haptic.success();
  // Сначала шторка уезжает, затем чек открывается обычным переходом — иначе переход
  // происходит под закрывающейся шторкой и анимации не видно.
  router.dismissTo('/pos');
  if (isSplitLayout()) {
    usePosSelection.getState().select(check.id);
  } else {
    setTimeout(() => router.push({ pathname: '/pos/[checkId]', params: { checkId: check.id } }), SHEET_DISMISS_MS);
  }
}

/** Сколько длится закрытие шторки iOS. */
const SHEET_DISMISS_MS = 420;

/** Понятный текст ошибки открытия чека. */
export function createCheckErrorMessage(message: string): string {
  if (message === 'No open shift') return 'Смена не открыта. Откройте смену в плашке на экране кассы.';
  return message;
}
