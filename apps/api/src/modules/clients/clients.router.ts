import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const clientsRouter = new Hono()
clientsRouter.use('*', requireAuth)

// TODO: CRUD clients, balance ops, bonus history, transactions
clientsRouter.get('/', async (c) => c.json({ clients: [] }))
clientsRouter.post('/', async (c) => c.json({ ok: true }))
clientsRouter.get('/:id', async (c) => c.json({ client: null }))
clientsRouter.patch('/:id', async (c) => c.json({ ok: true }))
clientsRouter.delete('/:id', async (c) => c.json({ ok: true }))
clientsRouter.get('/:id/transactions', async (c) => c.json({ transactions: [] }))
clientsRouter.post('/:id/balance', async (c) => c.json({ ok: true }))
clientsRouter.get('/:id/bonus-history', async (c) => c.json({ history: [] }))
