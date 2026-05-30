import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { prettyJSON } from 'hono/pretty-json'
import { bodyLimit } from 'hono/body-limit'
import { rateLimit } from './middleware/rateLimit.js'

import { authRouter } from './modules/auth/auth.router.js'
import { posRouter } from './modules/pos/pos.router.js'
import { shiftsRouter } from './modules/shifts/shifts.router.js'
import { menuRouter } from './modules/menu/menu.router.js'
import { clientsRouter } from './modules/clients/clients.router.js'
import { eventsRouter } from './modules/events/events.router.js'
import { customersRouter } from './modules/customers/customers.router.js'
import { spacesRouter } from './modules/spaces/spaces.router.js'
import { analyticsRouter } from './modules/analytics/analytics.router.js'
import { suppliesRouter } from './modules/supplies/supplies.router.js'
import { expensesRouter } from './modules/expenses/expenses.router.js'
import { certificatesRouter } from './modules/certificates/certificates.router.js'
import { salaryRouter } from './modules/salary/salary.router.js'
import { refundsRouter } from './modules/refunds/refunds.router.js'
import { notificationsRouter } from './modules/notifications/notifications.router.js'
import { aiRouter } from './modules/ai/ai.router.js'
import { systemRouter } from './modules/system/system.router.js'
import { uploadRouter } from './modules/upload/upload.router.js'
import { staffRouter } from './modules/staff/staff.router.js'
import { cashopsRouter } from './modules/cashops/cashops.router.js'
import { discountsRouter } from './modules/discounts/discounts.router.js'
import { inventoryRouter } from './modules/inventory/inventory.router.js'
import { plategaRouter } from './modules/platega/platega.router.js'

const app = new Hono()

// ── Логгер запросов с маскированием секретов в URL ───────────────────────────
// SSE-эндпоинты (/notifications/stream, /api/pos/checks/:id/events) принимают JWT
// через query-параметр ?token=<...>, потому что браузерный EventSource не умеет
// слать заголовок Authorization. Штатный hono/logger печатает строку из c.req.url
// (полный путь С query) → токен утекал бы в логи как валидный токен доступа.
// Поэтому используем собственный логгер того же формата ("  <-- METHOD path" и
// "  --> METHOD path status Nms"), но с БЕЗОПАСНЫМ путём: token / authorization /
// любые *token*-ключи в query маскируются в REDACTED. Метод, путь (без секретов),
// статус и тайминг сохраняются.
function redactUrlPath(rawUrl: string): string {
  // Берём pathname + search из полного URL; на нестандартном вводе — строка как есть.
  let pathWithQuery: string
  try {
    const u = new URL(rawUrl)
    pathWithQuery = u.pathname + u.search
  } catch {
    pathWithQuery = rawUrl
  }
  const qIdx = pathWithQuery.indexOf('?')
  if (qIdx === -1) return pathWithQuery
  const path = pathWithQuery.slice(0, qIdx)
  const params = new URLSearchParams(pathWithQuery.slice(qIdx + 1))
  let changed = false
  for (const key of Array.from(params.keys())) {
    // Любой ключ, содержащий "token" (token, access_token…), и явный
    // authorization/auth маскируем целиком, не раскрывая длину/префикс секрета.
    const lk = key.toLowerCase()
    if (lk.includes('token') || lk === 'authorization' || lk === 'auth') {
      params.set(key, 'REDACTED')
      changed = true
    }
  }
  if (!changed) return pathWithQuery
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

const requestLogger: MiddlewareHandler = async (c, next) => {
  const method = c.req.method
  // c.req.raw.url — полный URL запроса, в нём и живёт query с токеном.
  const safePath = redactUrlPath(c.req.raw.url)
  console.log(`  <-- ${method} ${safePath}`)
  const start = Date.now()
  await next()
  console.log(`  --> ${method} ${safePath} ${c.res.status} ${Date.now() - start}ms`)
}

app.use('*', requestLogger)
app.use('*', secureHeaders())
app.use(
  '*',
  cors({
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:3000',
    credentials: true,
  })
)
app.use('*', prettyJSON())
app.use('/api/*', bodyLimit({ maxSize: 1 * 1024 * 1024 }))
app.use('/api/*', rateLimit)

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }))
app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))

app.route('/api/auth', authRouter)
app.route('/api/pos', posRouter)
app.route('/api/shifts', shiftsRouter)
app.route('/api/menu', menuRouter)
app.route('/api/clients', clientsRouter)
app.route('/api/events', eventsRouter)
app.route('/api/customers', customersRouter)
app.route('/api/spaces', spacesRouter)
app.route('/api/analytics', analyticsRouter)
app.route('/api/supplies', suppliesRouter)
app.route('/api/expenses', expensesRouter)
app.route('/api/certificates', certificatesRouter)
app.route('/api/salary', salaryRouter)
app.route('/api/refunds', refundsRouter)
app.route('/api/notifications', notificationsRouter)
app.route('/api/ai', aiRouter)
app.route('/api/system', systemRouter)
app.route('/api/upload', uploadRouter)
app.route('/api/staff', staffRouter)
app.route('/api/cashops', cashopsRouter)
app.route('/api/discounts', discountsRouter)
app.route('/api/inventory', inventoryRouter)
app.route('/api/platega', plategaRouter)

app.onError((err, c) => {
  // Полную ошибку логируем только на сервере; наружу — обобщённое сообщение,
  // чтобы не утекали тексты драйвера БД, имена колонок и stack-трейсы.
  console.error(err)
  return c.json({ error: 'Internal error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export { app }
