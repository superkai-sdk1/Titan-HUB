import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const expensesRouter = new Hono()
expensesRouter.use('*', requireAuth)

// TODO: CRUD for expenses
expensesRouter.get('/', async (c) => c.json({ expenses: [] }))
expensesRouter.post('/', async (c) => c.json({ ok: true }))
expensesRouter.get('/:id', async (c) => c.json({ expense: null }))
expensesRouter.patch('/:id', async (c) => c.json({ ok: true }))
expensesRouter.delete('/:id', async (c) => c.json({ ok: true }))
