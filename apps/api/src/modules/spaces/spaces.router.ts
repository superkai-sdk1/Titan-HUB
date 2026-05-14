import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const spacesRouter = new Hono()
spacesRouter.use('*', requireAuth)

// TODO: CRUD for spaces
spacesRouter.get('/', async (c) => c.json({ spaces: [] }))
spacesRouter.post('/', async (c) => c.json({ ok: true }))
spacesRouter.get('/:id', async (c) => c.json({ space: null }))
spacesRouter.patch('/:id', async (c) => c.json({ ok: true }))
spacesRouter.delete('/:id', async (c) => c.json({ ok: true }))
