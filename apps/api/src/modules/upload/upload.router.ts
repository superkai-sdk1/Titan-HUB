import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const uploadRouter = new Hono()
uploadRouter.use('*', requireAuth)

// TODO: file upload handling (images, documents, etc.)
uploadRouter.post('/', async (c) => c.json({ ok: true, url: null }))
