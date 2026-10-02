/**
 * Прямая отправка push в Apple (APNs: HTTP/2 + JWT по ключу .p8) — для iOS-приложения
 * Titan Resident без посредника Expo (Expo Push требует EAS-проекта и загруженного туда
 * ключа). Ключ APNs общий для всей команды Apple, отдельный на приложение не нужен.
 *
 * Переменные окружения:
 *   APNS_KEY_P8   — содержимое AuthKey_XXXXXXXXXX.p8: PEM (переводы строк можно записать как \n)
 *                   или base64 от всего файла;
 *   APNS_KEY_ID   — идентификатор ключа (10 символов, из имени файла);
 *   APNS_TEAM_ID  — Team ID команды Apple;
 *   APNS_TOPIC    — bundle id приложения (по умолчанию ru.titan.resident).
 * Без них sendApns — no-op: лента в приложении и Telegram-бот работают и так.
 */
import http2 from 'node:http2'
import { createPrivateKey, createSign, type KeyObject } from 'node:crypto'

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const
type ApnsEnv = keyof typeof HOSTS

function loadKey(): KeyObject | null {
  const raw = process.env['APNS_KEY_P8']?.trim()
  if (!raw) return null
  const pem = raw.includes('PRIVATE KEY')
    ? raw.replace(/\\n/g, '\n')
    : Buffer.from(raw, 'base64').toString('utf8')
  try {
    return createPrivateKey(pem)
  } catch (err) {
    console.warn('[apns] APNS_KEY_P8 не читается как ключ .p8:', err)
    return null
  }
}

const KEY = loadKey()
const KEY_ID = process.env['APNS_KEY_ID']?.trim()
const TEAM_ID = process.env['APNS_TEAM_ID']?.trim()
const TOPIC = process.env['APNS_TOPIC']?.trim() || 'ru.titan.resident'
export const apnsEnabled = Boolean(KEY && KEY_ID && TEAM_ID)

if (!apnsEnabled) {
  console.warn('[apns] APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID не заданы — push на iPhone отключены (no-op).')
}

/** Нативный токен iOS: hex-строка (32 байта сейчас, Apple оставляет право удлинить). */
export function isApnsToken(token: string): boolean {
  return /^[0-9a-f]{64,200}$/i.test(token)
}

// ── Токен провайдера ────────────────────────────────────────────────────────
// JWT действует час; Apple просит обновлять не чаще раза в 20 минут.
let jwt: { token: string; issuedAt: number } | null = null

function providerToken(): string {
  const now = Math.floor(Date.now() / 1000)
  if (jwt && now - jwt.issuedAt < 40 * 60) return jwt.token
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'ES256', kid: KEY_ID })}.${b64({ iss: TEAM_ID, iat: now })}`
  const signature = createSign('SHA256')
    .update(unsigned)
    .sign({ key: KEY!, dsaEncoding: 'ieee-p1363' })
    .toString('base64url')
  jwt = { token: `${unsigned}.${signature}`, issuedAt: now }
  return jwt.token
}

// ── Соединения ──────────────────────────────────────────────────────────────
// Одно HTTP/2-соединение на окружение: все сообщения рассылки идут потоками в нём.
const sessions = new Map<ApnsEnv, http2.ClientHttp2Session>()

function session(env: ApnsEnv): http2.ClientHttp2Session {
  const existing = sessions.get(env)
  if (existing && !existing.closed && !existing.destroyed) return existing
  const s = http2.connect(HOSTS[env])
  const drop = () => { if (sessions.get(env) === s) sessions.delete(env) }
  s.on('error', (err) => { console.warn(`[apns] ${env}: ошибка соединения:`, err.message); drop() })
  s.on('goaway', drop)
  s.on('close', drop)
  // Простаивающее соединение закрываем сами — Apple всё равно рвёт его через час.
  s.setTimeout(10 * 60_000, () => s.close())
  sessions.set(env, s)
  return s
}

interface ApnsResponse { status: number; reason?: string }

function post(env: ApnsEnv, token: string, payload: string, expiration: number): Promise<ApnsResponse> {
  return new Promise((resolve) => {
    let req: http2.ClientHttp2Stream
    try {
      req = session(env).request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${providerToken()}`,
        'apns-topic': TOPIC,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(expiration),
      })
    } catch (err) {
      resolve({ status: 0, reason: err instanceof Error ? err.message : String(err) })
      return
    }
    let status = 0
    let body = ''
    req.setEncoding('utf8')
    req.setTimeout(15_000, () => {
      req.close(http2.constants.NGHTTP2_CANCEL)
      resolve({ status: 0, reason: 'timeout' })
    })
    req.on('response', (headers) => { status = Number(headers[':status']) })
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => {
      let reason: string | undefined
      try { reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined } catch { /* пустой ответ */ }
      resolve({ status, reason })
    })
    req.on('error', (err) => resolve({ status: 0, reason: err.message }))
    req.end(payload)
  })
}

// Токены отладочных сборок (Xcode / devicectl) живут в песочнице APNs. Боевой сервер
// пробует production, а при BadDeviceToken — sandbox и запоминает ответ до рестарта.
const sandboxTokens = new Set<string>()

export interface ApnsMessage {
  token: string
  title: string
  body: string
  badge?: number
  /** Группировка в центре уведомлений (у нас — канал: wallet / news). */
  threadId?: string
  /** Данные для перехода по нажатию — приложение читает их из ключа body. */
  data?: Record<string, unknown>
}

/** Отправить пачку push в APNs. Возвращает число принятых и токены, которые надо удалить. */
export async function sendApns(messages: ApnsMessage[]): Promise<{ accepted: number; dead: string[] }> {
  if (!apnsEnabled || !messages.length) return { accepted: 0, dead: [] }
  let accepted = 0
  const dead: string[] = []
  // Сообщение, не доставленное за 3 дня (телефон выключен), Apple выбросит.
  const expiration = Math.floor(Date.now() / 1000) + 3 * 24 * 3600

  const sendOne = async (m: ApnsMessage) => {
    const payload = JSON.stringify({
      aps: {
        alert: { title: m.title, body: m.body },
        sound: 'default',
        ...(m.badge != null ? { badge: m.badge } : {}),
        ...(m.threadId ? { 'thread-id': m.threadId } : {}),
      },
      body: m.data ?? {},
    })
    const firstEnv: ApnsEnv = sandboxTokens.has(m.token) ? 'sandbox' : 'production'
    let r = await post(firstEnv, m.token, payload, expiration)
    if (r.status === 400 && r.reason === 'BadDeviceToken') {
      const other: ApnsEnv = firstEnv === 'production' ? 'sandbox' : 'production'
      const retry = await post(other, m.token, payload, expiration)
      if (retry.status === 200) {
        if (other === 'sandbox') sandboxTokens.add(m.token)
        else sandboxTokens.delete(m.token)
      }
      r = retry
    }
    if (r.status === 200) { accepted++; return }
    if (r.status === 410 || (r.status === 400 && (r.reason === 'BadDeviceToken' || r.reason === 'DeviceTokenNotForTopic'))) {
      dead.push(m.token)
      return
    }
    if (r.status === 403) jwt = null // ExpiredProviderToken / InvalidProviderToken — перевыпустим
    console.warn('[apns] не доставлено:', r.status, r.reason ?? '', `…${m.token.slice(-6)}`)
  }

  // HTTP/2 мультиплексирует потоки; держим умеренный параллелизм.
  for (let i = 0; i < messages.length; i += 50) {
    await Promise.all(messages.slice(i, i + 50).map(sendOne))
  }
  return { accepted, dead }
}
