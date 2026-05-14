import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const eventsRouter = new Hono()
eventsRouter.use('*', requireAuth)

// TODO: CRUD for events
eventsRouter.get('/', async (c) => c.json({ events: [] }))
eventsRouter.post('/', async (c) => c.json({ ok: true }))
eventsRouter.get('/:id', async (c) => c.json({ event: null }))
eventsRouter.patch('/:id', async (c) => c.json({ ok: true }))
eventsRouter.delete('/:id', async (c) => c.json({ ok: true }))
