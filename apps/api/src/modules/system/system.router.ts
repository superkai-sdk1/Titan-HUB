import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { appSettings, eveningTypes, integrations, eq, inArray } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'
import { Redis } from 'ioredis'
import { updatesChannel } from '../../lib/realtime.js'
import { createBackup, listBackups, lastBackup, restoreNamed, restoreFromUpload, rcloneConfigured } from '../../lib/backup.js'
import { encryptSecret, decryptSecret, maskSecret, getClubIntegration } from '../../lib/secrets.js'
import { getActiveSbpProvider } from '../pay/registry.js'
import { getActiveFiscalProvider } from '../pay/fiscal/registry.js'
import { readPollConfigs, writePollConfigs, postPollConfig, type PollConfig } from '../../lib/polls.js'
import { recordPollPosted } from '../../lib/pollState.js'
import { setTelegramWebhook, deleteTelegramWebhook, getTelegramWebhookInfo, getChatAdministrators, getTelegramChat } from '../../lib/telegram.js'
import { tgWebhookSecret, tgWebhookUrl } from '../../lib/tgWebhook.js'
import { upsertRosterUser } from '../../lib/roster.js'
import { listChats, recordChat } from '../../lib/tgChats.js'
import { getBoolSetting } from '../../lib/appSettings.js'
// Control-БД: резолв clubId на основном домене (c.var.club=null → ищем по db_name).
import { getControlDb, clubs as ctrlClubs, eq as ceq } from '../../../../../packages/database/dist/control/index.js'

export const systemRouter = new Hono<AppEnv>()

// clubId текущего клуба: из контекста (клуб-поддомен) или по db_name основной БД
// (основной домен → синглтон). Нужен для URL/секрета вебхука бота опросов.
async function resolveClubId(c: { var: AppEnv['Variables'] }): Promise<string | null> {
  const fromCtx = c.var.club?.id
  if (fromCtx) return fromCtx
  try {
    const def = new URL(process.env['DATABASE_URL'] ?? '').pathname.replace(/^\//, '')
    const [club] = await getControlDb().select({ id: ctrlClubs.id }).from(ctrlClubs).where(ceq(ctrlClubs.dbName, def)).limit(1)
    return club?.id ?? null
  } catch {
    return null
  }
}

systemRouter.get('/info', requireAuth, async (c) => {
  const db = c.var.db
  const shift = await getCurrentShift(db)

  // Название вечера открытой смены: shift.eveningType — это ключ справочника
  // evening_types; резолвим в человекочитаемый label ('none' → «Без вечера»).
  let eveningName: string | null = null
  if (shift) {
    const key = (shift as { eveningType?: string }).eveningType
    if (!key || key === 'none') {
      eveningName = 'Без вечера'
    } else {
      const [et] = await db.select({ label: eveningTypes.label }).from(eveningTypes).where(eq(eveningTypes.key, key))
      eveningName = et?.label ?? key
    }
  }

  return c.json({
    version: process.env['npm_package_version'] ?? '1.0.0',
    shift: shift ?? null,
    eveningName,
    env: process.env['NODE_ENV'],
  })
})

systemRouter.get('/settings', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const rows = await db.select().from(appSettings)
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return c.json({ settings })
})

const SettingsSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'invalid setting key'),
    z.string().max(2000),
  )
  .refine((obj) => Object.keys(obj).length > 0 && Object.keys(obj).length <= 50, {
    message: 'expected 1..50 settings keys',
  })

systemRouter.patch('/settings', requireAuth, requireRole('owner'), zValidator('json', SettingsSchema), async (c) => {
  const db = c.var.db
  const body = c.req.valid('json')
  for (const [key, value] of Object.entries(body)) {
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, key))
    if (existing) {
      await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key))
    } else {
      await db.insert(appSettings).values({ key, value })
    }
  }
  return c.json({ ok: true })
})

// SSE endpoint for real-time updates
systemRouter.get('/update', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const send = (event: string, data: unknown) => {
    return writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  }

  // Subscribe to Redis channel (пер-клубный: суффикс по c.var.club?.id, на
  // основном домене → 'default'; sub и pub используют один канал).
  const channel = updatesChannel(c.var.club?.id)
  const subscriber = new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
  await subscriber.subscribe(channel)

  subscriber.on('message', (_channel: string, message: string) => {
    try {
      const payload = JSON.parse(message)
      send(payload.event, payload.data).catch(() => {})
    } catch {}
  })

  // Ping every 25s to keep connection alive
  const interval = setInterval(() => {
    send('ping', { ts: Date.now() }).catch(() => clearInterval(interval))
  }, 25000)

  // Send initial state
  send('connected', { ts: Date.now() }).catch(() => {})

  c.req.raw.signal.addEventListener('abort', () => {
    clearInterval(interval)
    subscriber.unsubscribe(channel).catch(() => {})
    subscriber.disconnect()
    writer.close().catch(() => {})
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})

// ─── Резервное копирование БД (кнопки в «О системе») ─────────────────────────

// Статус: последняя копия + настроен ли Google Drive. owner/staff (для отображения).
systemRouter.get('/backup/status', requireAuth, requireRole('owner', 'staff'), async (c) => {
  try {
    const [last, driveConfigured] = await Promise.all([lastBackup(), rcloneConfigured()])
    return c.json({ last, driveConfigured })
  } catch (e: any) {
    return c.json({ last: null, driveConfigured: false, error: e?.message })
  }
})

// Список доступных копий (Google Drive, иначе локальные). owner.
systemRouter.get('/backups', requireAuth, requireRole('owner'), async (c) => {
  return c.json(await listBackups())
})

// Создать полную копию БД сейчас + выгрузить в Google Drive (если настроен). owner.
systemRouter.post('/backup', requireAuth, requireRole('owner'), async (c) => {
  try {
    const r = await createBackup()
    return c.json({ ok: true, ...r })
  } catch (e: any) {
    return c.json({ error: e?.message ?? 'Не удалось создать копию' }, 500)
  }
})

// Восстановить из выбранной копии (Drive/локальной). СНАЧАЛА авто-бэкап текущей БД.
systemRouter.post('/restore', requireAuth, requireRole('owner'), zValidator('json', z.object({
  name: z.string().min(1),
  source: z.enum(['drive', 'local']),
})), async (c) => {
  const { name, source } = c.req.valid('json')
  try {
    const safety = await createBackup() // страховочная копия ДО замены
    await restoreNamed(name, source)
    return c.json({ ok: true, safetyBackup: safety.name })
  } catch (e: any) {
    return c.json({ error: e?.message ?? 'Не удалось восстановить' }, 500)
  }
})

// Восстановить из загруженного с устройства файла (.sql.gz). СНАЧАЛА авто-бэкап.
systemRouter.post('/restore-upload', requireAuth, requireRole('owner'), async (c) => {
  try {
    const body = await c.req.parseBody()
    const f = body['file']
    if (!(f instanceof File)) return c.json({ error: 'Файл не передан' }, 400)
    if (f.size > 200 * 1024 * 1024) return c.json({ error: 'Файл слишком большой (>200MB)' }, 413)
    const buf = Buffer.from(await f.arrayBuffer())
    const safety = await createBackup()
    await restoreFromUpload(buf)
    return c.json({ ok: true, safetyBackup: safety.name })
  } catch (e: any) {
    return c.json({ error: e?.message ?? 'Не удалось восстановить из файла' }, 500)
  }
})

// ─── Секреты интеграций заведения (токены ботов, AI, Platega) ────────────────
//
// Зашифрованное пер-клубное хранилище (таблица integrations в БД клуба).
// БЕЗОПАСНОСТЬ: только owner; plaintext НИКОГДА не отдаётся наружу (только маска);
// ключи строго из белого списка (анти-инъекция, защита от записи произвольных key).

// Белый список допустимых ключей + человекочитаемые подписи для UI.
// Любой key вне списка → 400 (никаких записей произвольных ключей в таблицу).
const INTEGRATION_KEYS: Record<string, string> = {
  admin_bot_token: 'Токен админ-бота Telegram',
  wallet_bot_token: 'Токен бота-кошелька Telegram',
  ai_api_key: 'API-ключ TITAN AI',
  platega_merchant_id: 'Platega: Merchant ID',
  platega_secret: 'Platega: секретный ключ',
  poll_bot_token: 'Токен бота опросов Telegram',
  // СБП-эквайеры (приём оплат). Заведение вводит свои боевые/тестовые ключи.
  tbank_terminal_key: 'Т-Банк: Terminal Key',
  tbank_password: 'Т-Банк: Password',
  yookassa_shop_id: 'ЮKassa: shopId',
  yookassa_secret_key: 'ЮKassa: секретный ключ',
  sber_username: 'СберБизнес: API-логин',
  sber_password: 'СберБизнес: API-пароль',
  alfa_username: 'Альфа/Точка: API-логин',
  alfa_password: 'Альфа/Точка: API-пароль',
  // Фискализация 54-ФЗ — АТОЛ Онлайн (облачная касса).
  atol_login: 'АТОЛ Онлайн: логин',
  atol_password: 'АТОЛ Онлайн: пароль',
  atol_group_code: 'АТОЛ Онлайн: код группы ККТ',
  atol_inn: 'АТОЛ Онлайн: ИНН',
  atol_payment_address: 'АТОЛ Онлайн: адрес расчётов',
  atol_company_email: 'АТОЛ Онлайн: e-mail компании',
  atol_sno: 'АТОЛ Онлайн: режим налогообложения (СНО)',
}

const isAllowedKey = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(INTEGRATION_KEYS, key)

// Список всех ключей белого списка с признаком configured и маской.
// НИКОГДА не возвращает сам секрет — только maskSecret(decrypt(value_enc)).
systemRouter.get('/integrations', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const rows = await db.select().from(integrations)
  // Карта key → расшифрованная маска (только для настроенных ключей).
  const byKey = new Map<string, string>()
  for (const r of rows) {
    if (!isAllowedKey(r.key)) continue // мусорные/устаревшие ключи в список не попадают
    try {
      byKey.set(r.key, maskSecret(decryptSecret(r.valueEnc)))
    } catch {
      // Шифртекст не расшифровался (сменили мастер-ключ/порча) — считаем «настроено»,
      // но маску показать не можем. Plaintext всё равно наружу не уходит.
      byKey.set(r.key, '••••')
    }
  }
  const items = Object.entries(INTEGRATION_KEYS).map(([key, label]) => {
    const masked = byKey.get(key) ?? null
    return { key, label, configured: masked !== null, masked }
  })
  return c.json({ items })
})

// Установить/обновить секрет. Пустое значение клиент НЕ шлёт (это «не менять»);
// min(1) на бэке гарантирует, что мы не затрём секрет пустой строкой.
systemRouter.patch(
  '/integrations/:key',
  requireAuth,
  requireRole('owner'),
  zValidator('json', z.object({ value: z.string().min(1).max(500) })),
  async (c) => {
    const db = c.var.db
    const key = c.req.param('key')
    if (!isAllowedKey(key)) return c.json({ error: 'Unknown integration key' }, 400)
    const { value } = c.req.valid('json')
    const user = c.get('user')

    const valueEnc = encryptSecret(value)
    await db
      .insert(integrations)
      .values({ key, valueEnc, updatedBy: user.sub })
      .onConflictDoUpdate({
        target: integrations.key,
        set: { valueEnc, updatedAt: new Date(), updatedBy: user.sub },
      })

    // Маску считаем из исходного plaintext (не из БД) — экономим расшифровку.
    return c.json({ ok: true, key, configured: true, masked: maskSecret(value) })
  },
)

// Явно удалить секрет (отключить интеграцию).
systemRouter.delete('/integrations/:key', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const key = c.req.param('key')
  if (!isAllowedKey(key)) return c.json({ error: 'Unknown integration key' }, 400)
  await db.delete(integrations).where(eq(integrations.key, key))
  return c.json({ ok: true, key, configured: false })
})

// ─── Конфигурация приёма оплат и фискализации (не секреты → app_settings) ──────
// Активный СБП-эквайер НЕ выбирается вручную — он выводится из того, чьи ключи
// введены (одно заведение = один эквайер), см. getActiveSbpProvider. Здесь —
// только производные настройки: fiscal_provider ('' выкл | 'yookassa' = сама
// пробивает чек 54-ФЗ), payment_test_mode (песочница), fiscal_vat_code (НДС ФФД).

const FISCAL_PROVIDERS = ['', 'yookassa'] as const
const SBP_LABELS: Record<string, string> = {
  platega: 'Platega', tbank: 'Т-Банк', yookassa: 'ЮKassa', sber: 'СберБизнес', alfa: 'Точка / Альфа',
}
const FISCAL_LABELS: Record<string, string> = {
  yookassa: 'ЮKassa (встроенная)', atol: 'АТОЛ Онлайн',
}
// Самостоятельные кассы (по введённым ключам) — выбор не ручной, как и эквайер.
const FISCAL_STANDALONE = ['atol']

systemRouter.get('/payment-config', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const rows = await db.select().from(appSettings)
    .where(inArray(appSettings.key, ['payment_test_mode', 'fiscal_vat_code', 'fiscal_default_phone']))
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  // Активный эквайер выводим из введённых ключей. «Настроен» = либо новый эквайер,
  // либо Platega с заданным merchant id (integrations или env основного инстанса).
  const sbpProvider = await getActiveSbpProvider(db)
  const plategaConfigured = !!((await getClubIntegration(db, 'platega_merchant_id')) ?? process.env['PLATEGA_MERCHANT_ID'])
  const sbpConfigured = sbpProvider !== 'platega' || plategaConfigured

  // Активный фискальный провайдер выводим так же. fiscalStandalone — настроена своя
  // касса (54-ФЗ на любую оплату); иначе тумблер ЮKassa (встроенная) при эквайере ЮKassa.
  const fiscalProvider = await getActiveFiscalProvider(db)

  return c.json({
    sbpProvider,
    sbpProviderLabel: SBP_LABELS[sbpProvider] ?? sbpProvider,
    sbpConfigured,
    fiscalProvider,
    fiscalLabel: FISCAL_LABELS[fiscalProvider] ?? '',
    fiscalStandalone: FISCAL_STANDALONE.includes(fiscalProvider),
    testMode: map['payment_test_mode'] === 'true',
    vatCode: Number(map['fiscal_vat_code']) || 1,
    defaultPhone: map['fiscal_default_phone'] || '',
  })
})

systemRouter.put(
  '/payment-config',
  requireAuth,
  requireRole('owner'),
  zValidator('json', z.object({
    fiscalProvider: z.enum(FISCAL_PROVIDERS).optional(),
    testMode: z.boolean().optional(),
    vatCode: z.number().int().min(1).max(6).optional(),
    defaultPhone: z.string().max(20).optional(),
  })),
  async (c) => {
    const db = c.var.db
    const b = c.req.valid('json')
    const updates: Array<[string, string]> = []
    if (b.fiscalProvider !== undefined) updates.push(['fiscal_provider', b.fiscalProvider])
    if (b.testMode !== undefined) updates.push(['payment_test_mode', String(b.testMode)])
    if (b.vatCode !== undefined) updates.push(['fiscal_vat_code', String(b.vatCode)])
    if (b.defaultPhone !== undefined) updates.push(['fiscal_default_phone', b.defaultPhone])
    for (const [key, value] of updates) {
      await db.insert(appSettings).values({ key, value })
        .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    }
    return c.json({ ok: true })
  },
)

// ─── Регулярные опросы Telegram (бот опросов) ───────────────────────────────────
// Только owner. Токен бота — отдельная интеграция poll_bot_token (маска как у
// прочих секретов). Конфиги опросов — JSON в app_settings (poll_configs).

// GET /system/polls — конфиги + статус токена (маска, не plaintext).
systemRouter.get('/polls', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const configs = await readPollConfigs(db)
  let tokenMasked: string | null = null
  try {
    const t = await getClubIntegration(db, 'poll_bot_token')
    if (t) tokenMasked = maskSecret(t)
  } catch {
    /* нет токена/ошибка расшифровки — оставляем null */
  }
  const commandsAdminOnly = await getBoolSetting('poll_commands_admin_only', true, db)
  return c.json({ configs, tokenConfigured: tokenMasked !== null, tokenMasked, commandsAdminOnly })
})

// POST /system/polls/commands — кто может слать команды-отметки (@all/@tvari/…):
// только админы чата (по умолчанию) или любой участник.
systemRouter.post(
  '/polls/commands',
  requireAuth,
  requireRole('owner'),
  zValidator('json', z.object({ adminOnly: z.boolean() })),
  async (c) => {
    const db = c.var.db
    const { adminOnly } = c.req.valid('json')
    const value = adminOnly ? '1' : '0'
    const key = 'poll_commands_admin_only'
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, key))
    if (existing) await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key))
    else await db.insert(appSettings).values({ key, value })
    return c.json({ ok: true, commandsAdminOnly: adminOnly })
  },
)

// GET /system/polls/chats — группы/топики, «увиденные» ботом (для выбора в UI
// вместо ручного ввода ID). Пусто, если сбор не включён или бот ещё ничего не видел.
systemRouter.get('/polls/chats', requireAuth, requireRole('owner'), async (c) => {
  const chats = await listChats(c.var.db)
  return c.json({ chats })
})

const PollConfigSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.string().max(32),
  enabled: z.boolean(),
  chatId: z.string().min(1).max(64),
  threadId: z.number().int().nullable(),
  title: z.string().min(1).max(200),
  subtitleDay: z.string().max(64),
  autoDay: z.boolean().optional(),
  subtitleTime: z.string().max(32),
  options: z.array(z.string().min(1).max(100)).min(2).max(10),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  postTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'время в формате HH:MM'),
  lastPostedAt: z.string().nullable().optional(),
})

// PUT /system/polls — сохранить конфиги (целиком). lastPostedAt мерджим из текущих
// (фронт его не ведёт), чтобы не сбросить идемпотентность постинга.
systemRouter.put(
  '/polls',
  requireAuth,
  requireRole('owner'),
  zValidator('json', z.object({ configs: z.array(PollConfigSchema).max(20) })),
  async (c) => {
    const db = c.var.db
    const { configs } = c.req.valid('json')
    const existing = await readPollConfigs(db)
    const lastById = new Map(existing.map((e) => [e.id, e.lastPostedAt]))
    const merged: PollConfig[] = configs.map((cfg) => ({
      ...cfg,
      lastPostedAt: cfg.lastPostedAt ?? lastById.get(cfg.id) ?? null,
    }))
    await writePollConfigs(db, merged)
    return c.json({ ok: true, configs: merged })
  },
)

// POST /system/polls/test — отправить опрос немедленно (проверка настроек).
systemRouter.post(
  '/polls/test',
  requireAuth,
  requireRole('owner'),
  zValidator('json', z.object({ id: z.string().min(1) })),
  async (c) => {
    const db = c.var.db
    const { id } = c.req.valid('json')
    const configs = await readPollConfigs(db)
    const cfg = configs.find((x) => x.id === id)
    if (!cfg) return c.json({ error: 'Опрос не найден' }, 404)
    const token = await getClubIntegration(db, 'poll_bot_token')
    if (!token) return c.json({ error: 'Не задан токен бота опросов' }, 400)
    const r = await postPollConfig(token, cfg)
    if (!r.ok) return c.json({ error: r.error ?? 'Не удалось отправить опрос' }, 502)
    if (r.pollId) await recordPollPosted(db, cfg.chatId, r.pollId, r.messageId ?? 0, cfg.threadId, cfg.options).catch(() => {})
    return c.json({ ok: true, messageId: r.messageId })
  },
)

// ─── Сбор участников чата (вебхук бота опросов) ─────────────────────────────────
// Telegram не отдаёт список участников — бот копит «увиденных» (голоса/сообщения/
// входы). Включение = setWebhook + мгновенный посев администраторов чатов.

// GET /system/polls/collect — включён ли сбор (сверяем url вебхука с нашим).
systemRouter.get('/polls/collect', requireAuth, requireRole('owner'), async (c) => {
  const token = await getClubIntegration(c.var.db, 'poll_bot_token')
  if (!token) return c.json({ enabled: false, tokenConfigured: false })
  const clubId = await resolveClubId(c)
  if (!clubId) return c.json({ enabled: false, tokenConfigured: true, error: 'club_not_registered' })
  const info = await getTelegramWebhookInfo(token)
  return c.json({ enabled: info.ok && info.url === tgWebhookUrl(clubId), tokenConfigured: true })
})

// POST /system/polls/collect — включить сбор: setWebhook + посеять админов чатов.
systemRouter.post('/polls/collect', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const token = await getClubIntegration(db, 'poll_bot_token')
  if (!token) return c.json({ error: 'Не задан токен бота опросов (раздел «Интеграции»)' }, 400)
  const clubId = await resolveClubId(c)
  if (!clubId) return c.json({ error: 'Клуб не зарегистрирован в реестре платформы' }, 400)

  const r = await setTelegramWebhook(token, tgWebhookUrl(clubId), tgWebhookSecret(clubId), [
    'message', 'poll_answer', 'chat_member', 'my_chat_member',
  ])
  if (!r.ok) return c.json({ error: r.error ?? 'Не удалось включить сбор' }, 502)

  // Посев: администраторы настроенных чатов сразу в ростер (остальных бот добавит,
  // как только они проголосуют/напишут).
  let seeded = 0
  try {
    const configs = await readPollConfigs(db)
    const chatIds = Array.from(new Set(configs.map((x) => x.chatId).filter(Boolean)))
    for (const chatId of chatIds) {
      // Сразу занести группу в список выбора (title/type), чтобы дропдаун не был пуст.
      const chat = await getTelegramChat(token, chatId)
      if (chat) await recordChat(db, chat).catch(() => {})
      const a = await getChatAdministrators(token, chatId)
      if (a.ok && a.admins) for (const u of a.admins) { if (await upsertRosterUser(db, u, chatId)) seeded++ }
    }
  } catch (e) {
    console.error('[polls] посев админов не удался', e)
  }
  return c.json({ ok: true, enabled: true, seeded })
})

// DELETE /system/polls/collect — выключить сбор (снять вебхук).
systemRouter.delete('/polls/collect', requireAuth, requireRole('owner'), async (c) => {
  const token = await getClubIntegration(c.var.db, 'poll_bot_token')
  if (token) await deleteTelegramWebhook(token)
  return c.json({ ok: true, enabled: false })
})
