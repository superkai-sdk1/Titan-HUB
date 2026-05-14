import { Hono } from 'hono'
import { requireAuth } from '../../middleware/auth.js'

export const analyticsRouter = new Hono()
analyticsRouter.use('*', requireAuth)

// TODO: dashboard stats and report generation
analyticsRouter.get('/dashboard', async (c) => c.json({ dashboard: null }))
analyticsRouter.get('/reports', async (c) => c.json({ reports: [] }))
