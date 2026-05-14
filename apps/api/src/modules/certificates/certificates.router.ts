import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const certificatesRouter = new Hono()
certificatesRouter.use('*', requireAuth)

// TODO: CRUD for certificates
certificatesRouter.get('/', async (c) => c.json({ certificates: [] }))
certificatesRouter.post('/', async (c) => c.json({ ok: true }))
certificatesRouter.get('/:id', async (c) => c.json({ certificate: null }))
certificatesRouter.patch('/:id', async (c) => c.json({ ok: true }))
certificatesRouter.delete('/:id', async (c) => c.json({ ok: true }))
