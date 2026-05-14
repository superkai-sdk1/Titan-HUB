import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const shiftsRouter = new Hono()
shiftsRouter.use('*', requireAuth)

// TODO: open/close shift, analytics, history
shiftsRouter.get('/current', async (c) => c.json({ shift: null }))
shiftsRouter.post('/open', async (c) => c.json({ ok: true }))
shiftsRouter.post('/close', async (c) => c.json({ ok: true }))
shiftsRouter.get('/history', async (c) => c.json({ shifts: [] }))
shiftsRouter.get('/:id/analytics', async (c) => c.json({ analytics: null }))
