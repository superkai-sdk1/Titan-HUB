import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const aiRouter = new Hono()
aiRouter.use('*', requireAuth)

// TODO: AI action dispatch and chat interface
aiRouter.post('/action', async (c) => c.json({ ok: true, result: null }))
aiRouter.get('/chat', async (c) => c.json({ messages: [] }))
