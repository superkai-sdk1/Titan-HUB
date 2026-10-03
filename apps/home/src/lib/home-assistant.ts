import { create } from 'zustand';

/**
 * Клиент Home Assistant по WebSocket API (`ws://<ha>:8123/api/websocket`).
 *
 * Планшет и Home Assistant стоят в одной сети клуба: планшет ходит к HA напрямую
 * (адрес и токен берёт из интеграций клуба через /pos/tablet/smart-home).
 * Состояния приходят подпиской subscribe_entities — плитка света переключится,
 * даже если свет щёлкнули выключателем на стене. Обрыв — переподключение с
 * нарастающей паузой; неверный токен — без повторов (нужно исправить в интеграциях).
 */

export type HaEntity = { entity_id: string; state: string; attributes: Record<string, unknown> };
export type HaStatus = 'idle' | 'connecting' | 'connected' | 'auth_failed' | 'offline';

type HaStore = { status: HaStatus; error: string | null; entities: Record<string, HaEntity> };

export const useHa = create<HaStore>()(() => ({ status: 'idle', error: null, entities: {} }));

/** «192.168.1.50» → «http://192.168.1.50:8123»; https-адреса — как есть. */
export function normalizeHaUrl(input: string): string | null {
  let raw = input.trim().replace(/\/+$/, '');
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  const m = /^(https?):\/\/([^/:]+)(:\d+)?(\/.*)?$/i.exec(raw);
  if (!m) return null;
  const [, scheme, host, port, path] = m;
  const p = port ?? (scheme!.toLowerCase() === 'http' ? ':8123' : '');
  return `${scheme!.toLowerCase()}://${host}${p}${path ?? ''}`;
}

function wsUrl(url: string): string {
  const base = (normalizeHaUrl(url) ?? url).replace(/^http/i, 'ws');
  return `${base}/api/websocket`;
}

/** Сжатый формат subscribe_entities: a — полные состояния, c — изменения, r — удалённые. */
type Compressed = { s?: string; a?: Record<string, unknown> };
type EntitiesEvent = {
  a?: Record<string, Compressed>;
  c?: Record<string, { '+'?: Compressed; '-'?: { a?: string[] } }>;
  r?: string[];
};

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

const RETRY_STEPS = [1000, 2000, 5000, 10_000, 20_000, 30_000];

class HaClient {
  private ws: WebSocket | null = null;
  private seq = 1;
  private pending = new Map<number, Pending>();
  private subId: number | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(readonly url: string, readonly token: string, readonly entityIds: string[]) {}

  get key() {
    return `${this.url}|${this.token}|${this.entityIds.join(',')}`;
  }

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.cleanup();
    this.ws?.close();
    this.ws = null;
    useHa.setState({ status: 'idle', error: null });
  }

  /** Вернулись из фона/сети нет — пробуем сразу, без ожидания паузы. */
  kick() {
    if (this.stopped || this.ws || useHa.getState().status === 'auth_failed') return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retry = 0;
    this.open();
  }

  private open() {
    if (this.stopped) return;
    useHa.setState({ status: useHa.getState().status === 'connected' ? 'connected' : 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(this.url));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)));
      } catch {
        /* битое сообщение — пропускаем */
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.cleanup();
      if (this.stopped || useHa.getState().status === 'auth_failed') return;
      useHa.setState({ status: 'offline', error: 'Нет связи с Home Assistant' });
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* следом придёт onclose */
    };
  }

  private send(payload: Record<string, unknown>) {
    this.ws?.send(JSON.stringify(payload));
  }

  private onMessage(msg: { type: string; id?: number; success?: boolean; result?: unknown; error?: { message?: string }; event?: unknown; message?: string }) {
    switch (msg.type) {
      case 'auth_required':
        this.send({ type: 'auth', access_token: this.token });
        break;
      case 'auth_ok':
        this.retry = 0;
        useHa.setState({ status: 'connected', error: null });
        this.subscribe();
        this.startPing();
        break;
      case 'auth_invalid':
        this.stopped = true;
        useHa.setState({ status: 'auth_failed', error: 'Home Assistant не принял токен' });
        this.ws?.close();
        break;
      case 'result': {
        const p = msg.id != null ? this.pending.get(msg.id) : undefined;
        if (!p || msg.id == null) break;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.success) p.resolve(msg.result);
        else p.reject(new Error(msg.error?.message || 'Home Assistant отклонил команду'));
        break;
      }
      case 'event':
        if (msg.id === this.subId) this.applyEntities(msg.event as EntitiesEvent);
        break;
      case 'pong':
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        break;
    }
  }

  private subscribe() {
    if (!this.entityIds.length) return;
    const id = this.seq++;
    this.subId = id;
    this.send({ id, type: 'subscribe_entities', entity_ids: this.entityIds });
  }

  private applyEntities(ev: EntitiesEvent) {
    const next = { ...useHa.getState().entities };
    for (const [id, s] of Object.entries(ev.a ?? {})) {
      next[id] = { entity_id: id, state: s.s ?? 'unknown', attributes: s.a ?? {} };
    }
    for (const [id, diff] of Object.entries(ev.c ?? {})) {
      const cur = next[id];
      if (!cur) continue;
      const attributes = { ...cur.attributes, ...(diff['+']?.a ?? {}) };
      for (const key of diff['-']?.a ?? []) delete attributes[key];
      next[id] = { ...cur, state: diff['+']?.s ?? cur.state, attributes };
    }
    for (const id of ev.r ?? []) delete next[id];
    useHa.setState({ entities: next });
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!this.ws) return;
      this.send({ id: this.seq++, type: 'ping' });
      if (this.pongTimer) clearTimeout(this.pongTimer);
      // Нет ответа — соединение «зависло» (Wi-Fi переподключился): рвём и открываем заново.
      this.pongTimer = setTimeout(() => this.ws?.close(), 10_000);
    }, 30_000);
  }

  private scheduleReconnect() {
    if (this.stopped || this.retryTimer) return;
    const delay = RETRY_STEPS[Math.min(this.retry, RETRY_STEPS.length - 1)]!;
    this.retry += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private cleanup() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pingTimer = null;
    this.pongTimer = null;
    this.retryTimer = null;
    this.subId = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Нет связи с Home Assistant'));
    }
    this.pending.clear();
  }

  request<T>(payload: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
    if (!this.ws || useHa.getState().status !== 'connected') {
      return Promise.reject(new Error('Нет связи с Home Assistant'));
    }
    const id = this.seq++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Home Assistant не ответил'));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send({ ...payload, id });
    });
  }
}

let client: HaClient | null = null;

/** Подключиться (или переподключиться, если сменились адрес, токен или устройства). */
export function connectHa(url: string, token: string, entityIds: string[]) {
  const next = new HaClient(url, token, [...entityIds].sort());
  if (client?.key === next.key) {
    client.kick();
    return;
  }
  client?.stop();
  useHa.setState({ entities: {} });
  client = next;
  client.start();
}

export function disconnectHa() {
  client?.stop();
  client = null;
  useHa.setState({ entities: {} });
}

export function kickHa() {
  client?.kick();
}

export function haCall(domain: string, service: string, entityId: string, data: Record<string, unknown> = {}) {
  if (!client) return Promise.reject(new Error('Умный дом не подключён'));
  return client.request({ type: 'call_service', domain, service, service_data: data, target: { entity_id: entityId } });
}

/** Все сущности HA — для выбора устройств кабинки в панели сотрудника. */
export function haGetStates(): Promise<HaEntity[]> {
  if (!client) return Promise.reject(new Error('Умный дом не подключён'));
  return client.request<HaEntity[]>({ type: 'get_states' }, 20_000);
}

/** Оптимистично показать результат команды до подтверждения от HA. */
export function patchEntity(entityId: string, patch: { state?: string; attributes?: Record<string, unknown> }) {
  const cur = useHa.getState().entities[entityId];
  if (!cur) return () => {};
  useHa.setState((s) => ({
    entities: {
      ...s.entities,
      [entityId]: { ...cur, state: patch.state ?? cur.state, attributes: { ...cur.attributes, ...(patch.attributes ?? {}) } },
    },
  }));
  // Откат, если HA не выполнил команду.
  return () => useHa.setState((s) => ({ entities: { ...s.entities, [entityId]: cur } }));
}
