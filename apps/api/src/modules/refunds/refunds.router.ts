import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const refundsRouter = new Hono()
refundsRouter.use('*', requireAuth)

// TODO: CRUD for refunds
refundsRouter.get('/', async (c) => c.json({ refunds: [] }))
refundsRouter.post('/', async (c) => c.json({ ok: true }))
refundsRouter.get('/:id', async (c) => c.json({ refund: null }))
refundsRouter.patch('/:id', async (c) => c.json({ ok: true }))
refundsRouter.delete('/:id', async (c) => c.json({ ok: true }))
