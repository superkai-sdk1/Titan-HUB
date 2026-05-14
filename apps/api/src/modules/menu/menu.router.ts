import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const menuRouter = new Hono()
menuRouter.use('*', requireAuth)

// TODO: CRUD for inventory items, categories, modifiers
menuRouter.get('/items', async (c) => c.json({ items: [] }))
menuRouter.post('/items', async (c) => c.json({ ok: true }))
menuRouter.get('/items/:id', async (c) => c.json({ item: null }))
menuRouter.patch('/items/:id', async (c) => c.json({ ok: true }))
menuRouter.delete('/items/:id', async (c) => c.json({ ok: true }))
menuRouter.get('/categories', async (c) => c.json({ categories: [] }))
menuRouter.post('/categories', async (c) => c.json({ ok: true }))
menuRouter.patch('/categories/:id', async (c) => c.json({ ok: true }))
menuRouter.delete('/categories/:id', async (c) => c.json({ ok: true }))
menuRouter.get('/items/:id/modifiers', async (c) => c.json({ modifiers: [] }))
menuRouter.post('/items/:id/modifiers', async (c) => c.json({ ok: true }))
menuRouter.delete('/items/:itemId/modifiers/:modId', async (c) => c.json({ ok: true }))
