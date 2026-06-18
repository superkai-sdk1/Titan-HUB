import { appSettings, eq, type Database } from '@titan/database'
import { sendTelegramPoll, type SendPollResult } from './telegram.js'

// ─────────────────────────────────────────────────────────────────────────────
// Регулярные опросы Telegram (пер-клуб). Конфиги хранятся в app_settings клуба
// под ключом poll_configs (JSON-массив) — без отдельной таблицы/миграции.
// Постит планировщик (cron/polls.ts) от токена poll_bot_token (integrations клуба).
//
// Модель (решение владельца): подзаголовок (день+время) — СТАТИЧНЫЙ текст,
// постинг — по ОТДЕЛЬНОМУ расписанию (дни недели + время МСК). Опросы постятся в
// топик «Опросы» супергруппы (message_thread_id).
// ─────────────────────────────────────────────────────────────────────────────

export const POLL_CONFIGS_KEY = 'poll_configs'

export interface PollConfig {
  id: string
  /** Метка для UI/логов: 'sport' | 'city' | произвольная. */
  kind: string
  enabled: boolean
  /** ID чата супергруппы, напр. "-1001281350483". */
  chatId: string
  /** message_thread_id топика (форум). null = в общий чат. */
  threadId: number | null
  /** Заголовок опроса, напр. «Спортивная мафия». */
  title: string
  /** Подзаголовок: день недели события (статичный текст), напр. «Пятница».
   *  Игнорируется, если autoDay=true (тогда подставляется день выкладки). */
  subtitleDay: string
  /** Если true — день недели в подзаголовке = день ВЫКЛАДКИ опроса (сегодня, МСК),
   *  а не статичный subtitleDay. */
  autoDay?: boolean
  /** Подзаголовок: время события (статичный текст), напр. «20:00». */
  subtitleTime: string
  options: string[]
  /** Дни недели ПОСТИНГА: 1=Пн … 7=Вс. */
  weekdays: number[]
  /** Время постинга МСК «HH:MM». */
  postTime: string
  /** ISO момента последнего успешного постинга (для идемпотентности). */
  lastPostedAt: string | null
}

export async function readPollConfigs(db: Database): Promise<PollConfig[]> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, POLL_CONFIGS_KEY))
    if (!row?.value) return []
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed) ? (parsed as PollConfig[]) : []
  } catch {
    return []
  }
}

export async function writePollConfigs(db: Database, configs: PollConfig[]): Promise<void> {
  const value = JSON.stringify(configs)
  const [ex] = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, POLL_CONFIGS_KEY))
  if (ex) await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, POLL_CONFIGS_KEY))
  else await db.insert(appSettings).values({ key: POLL_CONFIGS_KEY, value })
}

// Русские названия дней недели (1=Пн..7=Вс).
const RU_WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

// День недели момента nowMs по МСК (UTC+3), напр. «Среда».
export function russianWeekday(nowMs: number): string {
  const d = new Date(nowMs + 3 * 3600 * 1000)
  const js = d.getUTCDay() // 0=Вс..6=Сб
  const idx = js === 0 ? 6 : js - 1 // 0=Пн..6=Вс
  return RU_WEEKDAYS[idx]!
}

// Текст вопроса = «Заголовок\nДень Время». День: автоматический (день выкладки,
// nowMs) — ДЕФОЛТ; статичный subtitleDay только при ЯВНОМ autoDay===false.
//
// ВАЖНО (фикс бага «в четверг постит Пятница»): раньше тут было `cfg.autoDay ?`,
// поэтому конфиг без поля autoDay (undefined — легаси или не сохранён) уходил в
// СТАТИЧНЫЙ subtitleDay. А интерфейс (manage/polls) показывает тумблер «по дню
// выкладки» как `autoDay !== false`, т.е. при undefined — ВКЛЮЧЁННЫМ. Рассинхрон:
// в UI авто-день «включён», а бот постит зашитую «Пятница». Теперь бэк трактует
// undefined так же, как UI — как авто (день выкладки).
//
// forceTodayDay — для кнопки «Выложить на сегодня»: день = день выкладки ВСЕГДА,
// даже если autoDay выключен у конфига.
export function buildPollQuestion(
  cfg: PollConfig,
  nowMs: number = Date.now(),
  forceTodayDay = false,
): string {
  const useAutoDay = forceTodayDay || cfg.autoDay !== false
  const day = useAutoDay ? russianWeekday(nowMs) : (cfg.subtitleDay ?? '').trim()
  const sub = [day, (cfg.subtitleTime ?? '').trim()].filter(Boolean).join(' ')
  return sub ? `${cfg.title}\n${sub}` : cfg.title
}

// ── Расписание (МСК = UTC+3) ─────────────────────────────────────────────────
// Час/день берём в МСК независимо от TZ контейнера (как остальной cron).
function mskParts(nowMs: number): { dow: number; minutes: number } {
  const d = new Date(nowMs + 3 * 3600 * 1000)
  const jsDow = d.getUTCDay() // 0=Вс..6=Сб
  const dow = jsDow === 0 ? 7 : jsDow // 1=Пн..7=Вс
  return { dow, minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

// UTC-мс момента «сегодня в postTime по МСК».
function scheduledTodayMs(nowMs: number, schedMin: number): number {
  const d = new Date(nowMs + 3 * 3600 * 1000)
  const mskMidnightUtcMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3 * 3600 * 1000
  return mskMidnightUtcMs + schedMin * 60_000
}

/**
 * Пора ли постить cfg в момент nowMs. РОБАСТНО к дрейфу тика/рестарту: постим
 * ОДИН раз, как только наступил день недели и время дня (now ≥ запланированного
 * сегодня) и в этот слот ещё не постили (lastPostedAt < запланированного сегодня).
 */
export function isPollDue(cfg: PollConfig, nowMs: number): boolean {
  if (!cfg.enabled) return false
  if (!cfg.chatId || !cfg.title || !Array.isArray(cfg.options) || cfg.options.length < 2) return false
  const { dow, minutes } = mskParts(nowMs)
  if (!Array.isArray(cfg.weekdays) || !cfg.weekdays.includes(dow)) return false
  const m = /^(\d{1,2}):(\d{2})$/.exec(cfg.postTime ?? '')
  if (!m) return false
  const schedMin = parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10)
  if (minutes < schedMin) return false // ещё не наступило время сегодня
  const schedTodayMs = scheduledTodayMs(nowMs, schedMin)
  if (cfg.lastPostedAt) {
    const last = new Date(cfg.lastPostedAt).getTime()
    if (!Number.isNaN(last) && last >= schedTodayMs) return false // уже постили этот слот
  }
  return true
}

// Отправить опрос по конфигу (через токен бота опросов).
// opts.forceTodayDay — выложить с СЕГОДНЯШНИМ днём недели независимо от autoDay
// (кнопка «Выложить на сегодня»).
export function postPollConfig(
  token: string,
  cfg: PollConfig,
  opts?: { forceTodayDay?: boolean },
): Promise<SendPollResult> {
  return sendTelegramPoll(token, {
    chatId: cfg.chatId,
    messageThreadId: cfg.threadId,
    question: buildPollQuestion(cfg, Date.now(), opts?.forceTodayDay ?? false),
    options: cfg.options,
    isAnonymous: false,
    allowsMultipleAnswers: false,
  })
}
