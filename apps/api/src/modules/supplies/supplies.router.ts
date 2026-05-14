import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const suppliesRouter = new Hono()
suppliesRouter.use('*', requireAuth)

// TODO: CRUD for supplies
suppliesRouter.get('/', async (c) => c.json({ supplies: [] }))
suppliesRouter.post('/', async (c) => c.json({ ok: true }))
suppliesRouter.get('/:id', async (c) => c.json({ supply: null }))
suppliesRouter.patch('/:id', async (c) => c.json({ ok: true }))
suppliesRouter.delete('/:id', async (c) => c.json({ ok: true }))
