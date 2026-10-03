import { useEffect, useEffectEvent, useRef } from 'react';

import { ApiError } from './api';
import { useCart } from './cart';
import { useFlow } from './flow';
import { usePrefs } from './prefs';
import { fetchCheck, invalidate, useOpenCheckId, useSmartHome } from './queries';
import { useCheckEvents } from './realtime';
import { roomAllOff } from './room';

/**
 * Ведёт визит по данным сервера:
 *  - появился открытый счёт зоны → session;
 *  - счёт пропал из открытых → проверяем сам чек: закрыт → finish (спасибо и оценка),
 *    отменён/переехал в другую зону → снова idle;
 *  - SSE «оплачено» переводит в finish сразу, не дожидаясь опроса.
 */
export function useFlowDriver() {
  const phase = useFlow((s) => s.phase);
  const sessionId = phase.kind === 'session' ? phase.checkId : null;
  const open = useOpenCheckId(sessionId ? 10_000 : 4_000);
  const verifying = useRef(false);
  const smartHome = useSmartHome();

  useCheckEvents(sessionId);

  const reconcile = useEffectEvent(async (openId: string | null) => {
    const flow = useFlow.getState();
    const cur = flow.phase;
    if (cur.kind === 'idle') {
      if (openId) flow.startSession(openId);
      return;
    }
    if (cur.kind !== 'session' || openId === cur.checkId || verifying.current) return;
    verifying.current = true;
    try {
      const check = await fetchCheck(cur.checkId);
      if (check.status === 'closed') flow.finish(cur.checkId, false);
      else if (check.status === 'cancelled') flow.toIdle();
      else if (openId) flow.startSession(openId);
    } catch (e) {
      // Чек удалили или он больше не в нашей зоне — просто возвращаемся в простой.
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) flow.toIdle();
    } finally {
      verifying.current = false;
    }
  });

  useEffect(() => {
    if (open.isSuccess && !open.isFetching) void reconcile(open.data ?? null);
  }, [open.isSuccess, open.isFetching, open.data, open.dataUpdatedAt]);

  // Смена фазы: корзина живёт только внутри визита; после счёта — гасим комнату (если включено).
  const onPhase = useEffectEvent((kind: string) => {
    if (kind !== 'session') useCart.getState().clear();
    if (kind === 'finish') {
      void invalidate('open-check');
      const room = smartHome.data?.room;
      if (room && usePrefs.getState().roomAutoOff) void roomAllOff(room);
    }
  });

  useEffect(() => {
    onPhase(phase.kind);
  }, [phase.kind]);
}
