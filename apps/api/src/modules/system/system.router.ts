import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { appSettings, eveningTypes, integrations, eq } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getCurrentShift } from '../shifts/shifts.service.js'
import { Redis } from 'ioredis'
import { updatesChannel } from '../../lib/realtime.js'
import { createBackup, listBackups, lastBackup, restoreNamed, restoreFromUpload, rcloneConfigured } from '../../lib/backup.js'
import { encryptSecret, decryptSecret, maskSecret } from '../../lib/secrets.js'

export const systemRouter = new Hono<AppEnv>()

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
