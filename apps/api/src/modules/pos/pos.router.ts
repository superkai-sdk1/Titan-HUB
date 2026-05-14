import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const posRouter = new Hono()
posRouter.use('*', requireAuth)

// TODO: implement check CRUD, cart management, payment processing
posRouter.get('/checks', async (c) => c.json({ checks: [] }))
posRouter.post('/checks', async (c) => c.json({ ok: true }))
posRouter.get('/checks/:id', async (c) => c.json({ check: null }))
posRouter.patch('/checks/:id', async (c) => c.json({ ok: true }))
posRouter.delete('/checks/:id', async (c) => c.json({ ok: true }))
posRouter.post('/checks/:id/pay', async (c) => c.json({ ok: true }))
posRouter.post('/checks/:id/items', async (c) => c.json({ ok: true }))
posRouter.delete('/checks/:id/items/:itemId', async (c) => c.json({ ok: true }))
