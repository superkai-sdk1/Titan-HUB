import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';

import { toast, useFlow } from './flow';
import { haptic } from './haptics';
import { invalidate } from './queries';
import { hostOrigin, useSession } from './session';

/**
 * Живые события открытого счёта по SSE (/pos/checks/:id/events, Bearer tablet-токен):
 * позиции из кассы, решения по заказам гостя, сообщения персонала, оплата.
 * Сервер шлёт `data: {"event": "...", "data": {...}}` без имени события.
 */
type CheckEvent = {
  event: string;
  data?: { checkId?: string; status?: string; sender?: 'guest' | 'staff' };
};

export function useCheckEvents(checkId: string | null) {
  const host = useSession((s) => s.club?.host ?? null);
  const token = useSession((s) => s.token);

  const onEvent = useEffectEvent((raw: string | null) => {
    if (!checkId || !raw) return;
    let msg: CheckEvent;
    try {
      msg = JSON.parse(raw) as CheckEvent;
    } catch {
      return;
    }
    void invalidate('check', checkId);
    switch (msg.event) {
      case 'check:paid':
        haptic.success();
        useFlow.getState().finish(checkId, true);
        break;
      case 'check:closed':
      case 'check:deleted':
        void invalidate('open-check');
        break;
      case 'order:resolved':
        if (msg.data?.status === 'confirmed') {
          haptic.success();
          toast('Заказ подтверждён — уже готовим');
        } else if (msg.data?.status === 'rejected') {
          haptic.warning();
          toast('Заказ отклонён. Администратор подойдёт уточнить', 'warning');
        }
        break;
      case 'chat:message':
        void invalidate('chat', checkId);
        if (msg.data?.sender === 'staff') {
          haptic.success();
          toast('Новое сообщение от администратора', 'info');
        }
        break;
      case 'chat:read':
        void invalidate('chat', checkId);
        break;
    }
  });

  useEffect(() => {
    if (!host || !token || !checkId) return;
    let es: EventSource | null = null;

    const close = () => {
      es?.removeAllEventListeners();
      es?.close();
      es = null;
    };
    const connect = () => {
      close();
      es = new EventSource(`${hostOrigin(host)}/api/pos/checks/${checkId}/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        pollingInterval: 4000,
        timeoutBeforeConnection: 0,
      });
      es.addEventListener('message', (e) => onEvent(e.data));
    };

    connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        connect();
        void invalidate('check', checkId);
      } else if (state === 'background') {
        close();
      }
    });
    return () => {
      sub.remove();
      close();
    };
  }, [host, token, checkId]);
}
