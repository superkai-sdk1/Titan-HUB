import { useEffect } from 'react';
import { AppState } from 'react-native';

import { connectHa, disconnectHa, kickHa } from './home-assistant';
import { useSmartHome } from './queries';
import { roomEntityIds } from './room';

/**
 * Держит связь с Home Assistant, пока планшет вошёл в клуб: адрес и токен — из
 * интеграций клуба, устройства — те, что сотрудник выбрал для этой кабинки.
 * Без устройств соединение всё равно поднимаем — оно нужно панели сотрудника,
 * чтобы показать список устройств HA.
 */
export function useRoomConnection() {
  const { data } = useSmartHome();
  const url = data?.connection?.url ?? null;
  const token = data?.connection?.token ?? null;
  const ids = roomEntityIds(data?.room).join(',');

  useEffect(() => {
    if (!url || !token) {
      disconnectHa();
      return;
    }
    connectHa(url, token, ids ? ids.split(',') : []);
  }, [url, token, ids]);

  useEffect(() => () => disconnectHa(), []);

  // Планшет просыпается/Wi-Fi вернулся — переподключаемся сразу, не дожидаясь паузы.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') kickHa();
    });
    return () => sub.remove();
  }, []);
}

/** Комната настроена: есть подключение и хотя бы одно устройство. */
export function useRoom() {
  const { data } = useSmartHome();
  const room = data?.room ?? null;
  const configured = !!data?.connection && !!room && (room.lights.length > 0 || !!room.climate);
  return { room, configured, hasConnection: !!data?.connection };
}
