import { useEffect } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';

import { useBanner } from './banner';
import { checkTitle } from './checks';
import { haptic } from './haptics';
import { queryClient } from './query';
import { hostOrigin, useSession } from './session';
import type { AppNotification, CheckListItem } from './types';

/**
 * Живые обновления клуба по SSE (react-native-sse, Bearer-токен):
 * - /system/update — события чеков и заказов → мгновенный перезапрос данных;
 * - /notifications/stream — уведомления персоналу → лента и баннер.
 *
 * Заказы и чат из кабинок берём из /system/update: в клубных поддоменах сервер пока
 * публикует эти уведомления не в канал клуба (баг прода, вынесен в отдельную задачу).
 */

type UpdateEvent =
  | 'connected'
  | 'ping'
  | 'check:created'
  | 'check:updated'
  | 'check:deleted'
  | 'check:paid'
  | 'check:closed'
  | 'order:created'
  | 'order:resolved'
  | 'chat:message'
  | 'chat:read';

const ATTENTION = new Set(['staff_call', 'request_bill', 'client_order', 'chat_message']);

function parse<T>(data: string | null): T | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

function checkName(host: string, checkId: string): string | null {
  const checks = queryClient.getQueryData<CheckListItem[]>([host, 'pos', 'checks']);
  const check = checks?.find((c) => c.id === checkId);
  if (!check) return null;
  return check.spaceName ? `${checkTitle(check)} · ${check.spaceName}` : checkTitle(check);
}

export function useRealtime() {
  const host = useSession((s) => s.club?.host ?? null);
  const token = useSession((s) => s.token);

  useEffect(() => {
    if (!host || !token) return;

    let updates: EventSource<UpdateEvent> | null = null;
    let notifications: EventSource | null = null;

    const invalidate = (...keys: string[][]) => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: [host, ...key] });
    };

    const close = () => {
      updates?.removeAllEventListeners();
      updates?.close();
      notifications?.removeAllEventListeners();
      notifications?.close();
      updates = null;
      notifications = null;
    };

    const connect = () => {
      close();
      const options = {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        pollingInterval: 4000,
        timeoutBeforeConnection: 0,
      };

      updates = new EventSource<UpdateEvent>(`${hostOrigin(host)}/api/system/update`, options);

      const onCheckChanged = (data: string | null) => {
        const payload = parse<{ checkId?: string }>(data);
        invalidate(['pos', 'checks'], ['pos', 'shift-summary']);
        if (payload?.checkId) invalidate(['pos', 'check', payload.checkId]);
      };
      updates.addEventListener('check:created', (e) => onCheckChanged(e.data));
      updates.addEventListener('check:updated', (e) => onCheckChanged(e.data));
      updates.addEventListener('check:deleted', (e) => onCheckChanged(e.data));
      updates.addEventListener('check:paid', (e) => onCheckChanged(e.data));
      updates.addEventListener('check:closed', (e) => onCheckChanged(e.data));
      updates.addEventListener('order:resolved', (e) => onCheckChanged(e.data));
      updates.addEventListener('chat:read', (e) => {
        const payload = parse<{ checkId: string }>(e.data);
        if (payload) invalidate(['pos', 'chat', payload.checkId]);
      });

      updates.addEventListener('order:created', (e) => {
        onCheckChanged(e.data);
        const payload = parse<{ checkId: string; orderId: string }>(e.data);
        if (!payload) return;
        haptic.warning();
        useBanner.getState().show({
          key: payload.orderId,
          type: 'client_order',
          title: 'Заказ из кабинки',
          body: checkName(host, payload.checkId) ?? 'Гость ждёт подтверждения',
          checkId: payload.checkId,
        });
      });

      updates.addEventListener('chat:message', (e) => {
        const payload = parse<{ checkId: string; messageId: string; sender: 'guest' | 'staff' }>(e.data);
        if (!payload) return;
        invalidate(['pos', 'chat', payload.checkId]);
        if (payload.sender !== 'guest') return;
        invalidate(['pos', 'check', payload.checkId]);
        haptic.light();
        useBanner.getState().show({
          key: payload.messageId,
          type: 'chat_message',
          title: 'Сообщение из кабинки',
          body: checkName(host, payload.checkId) ?? 'Откройте чат чека',
          checkId: payload.checkId,
        });
      });

      notifications = new EventSource(`${hostOrigin(host)}/api/notifications/stream`, options);
      notifications.addEventListener('message', (e) => {
        const incoming = parse<Omit<AppNotification, 'isRead'>>(e.data);
        if (!incoming?.id) return;
        const notification: AppNotification = { ...incoming, isRead: false };

        // Группы уведомлений приходят с тем же id — обновляем запись и поднимаем её наверх.
        queryClient.setQueryData<AppNotification[]>([host, 'notifications'], (old) => [
          notification,
          ...(old ?? []).filter((n) => n.id !== notification.id),
        ]);

        if (ATTENTION.has(notification.type)) {
          if (notification.type === 'staff_call' || notification.type === 'request_bill') haptic.warning();
          const checkId = typeof notification.meta?.checkId === 'string' ? notification.meta.checkId : undefined;
          useBanner.getState().show({
            key: notification.id,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            checkId,
          });
        }
      });
    };

    connect();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        connect();
        invalidate(['pos'], ['notifications']);
      } else if (state === 'background') {
        close();
      }
    });

    return () => {
      sub.remove();
      close();
    };
  }, [host, token]);
}
