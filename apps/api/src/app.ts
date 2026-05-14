import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { prettyJSON } from 'hono/pretty-json'
import { bodyLimit } from 'hono/body-limit'

import { authRouter } from './modules/auth/auth.router.js'
import { posRouter } from './modules/pos/pos.router.js'
import { shiftsRouter } from './modules/shifts/shifts.router.js'
import { menuRouter } from './modules/menu/menu.router.js'
import { clientsRouter } from './modules/clients/clients.router.js'
import { eventsRouter } from './modules/events/events.router.js'
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

const app = new Hono()

app.use('*', logger())
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

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }))

app.route('/api/auth', authRouter)
app.route('/api/pos', posRouter)
app.route('/api/shifts', shiftsRouter)
app.route('/api/menu', menuRouter)
app.route('/api/clients', clientsRouter)
app.route('/api/events', eventsRouter)
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

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export { app }
