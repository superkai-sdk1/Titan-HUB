import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const salaryRouter = new Hono()
salaryRouter.use('*', requireAuth)

// TODO: salary management, estimates, and payouts
salaryRouter.get('/', async (c) => c.json({ salaries: [] }))
salaryRouter.post('/', async (c) => c.json({ ok: true }))
salaryRouter.get('/estimate', async (c) => c.json({ estimate: null }))
salaryRouter.get('/:id', async (c) => c.json({ salary: null }))
salaryRouter.patch('/:id', async (c) => c.json({ ok: true }))
salaryRouter.delete('/:id', async (c) => c.json({ ok: true }))
