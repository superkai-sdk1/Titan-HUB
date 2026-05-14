import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const notificationsRouter = new Hono()
notificationsRouter.use('*', requireAuth)

// TODO: CRUD for notifications, mark read
notificationsRouter.get('/', async (c) => c.json({ notifications: [] }))
notificationsRouter.post('/', async (c) => c.json({ ok: true }))
notificationsRouter.get('/:id', async (c) => c.json({ notification: null }))
notificationsRouter.patch('/:id', async (c) => c.json({ ok: true }))
notificationsRouter.delete('/:id', async (c) => c.json({ ok: true }))
